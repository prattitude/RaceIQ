namespace Trailbrake;

public sealed record CueSnapshot(
    string State,
    string? CornerName,
    double? MetersToBrake,
    string? TipText,
    string? CallText,
    int? ReferenceLapId,
    bool ShouldSpeak,
    string? Phase,
    bool ShouldPlaySound,
    string? SoundKind
);

/// <summary>
/// Deterministic approach + modulation cue evaluation from a reference cue plan + live distance.
/// Target ≤ ~20 Hz from the companion timer; no ML inference.
/// </summary>
public sealed class CueEngine
{
    private TrailbrakeCuePlan? _plan;
    private int? _referenceLapId;
    private string? _spokenCorner;
    private double _lapStartDistance;
    private int _lastLapNumber = -1;
    private readonly HashSet<string> _fired = new(StringComparer.Ordinal);

    public void SetReference(TrailbrakeReferenceLap? reference, TrailbrakeCuePlan? plan)
    {
        _referenceLapId = reference?.LapId;
        _plan = plan;
        _spokenCorner = null;
        _fired.Clear();
    }

    public void ClearReference()
    {
        _referenceLapId = null;
        _plan = null;
        _spokenCorner = null;
        _fired.Clear();
    }

    public CueSnapshot Evaluate(TrailbrakeLiveSample? live, TrailbrakeConfig config, bool npuReady, bool sessionActive)
    {
        if (!npuReady || !config.Enabled)
        {
            return Idle("unavailable");
        }

        if (!sessionActive || live is null)
        {
            return Idle("waiting-session");
        }

        if (_plan is null || _plan.Corners.Count == 0)
        {
            return new CueSnapshot("armed", null, null, "No reference cue plan yet.", null, _referenceLapId, false, null, false, null);
        }

        if (live.LapNumber != _lastLapNumber)
        {
            _lastLapNumber = live.LapNumber;
            _lapStartDistance = live.DistanceTraveled;
            _spokenCorner = null;
            _fired.Clear();
        }

        var lapDistance = Math.Max(0, live.DistanceTraveled - _lapStartDistance);
        var trackLength = _plan.TrackLengthM is > 1 ? _plan.TrackLengthM.Value : EstimateTrackLength(_plan);
        var leadMeters = Math.Max(5, live.SpeedMps * (config.CueLeadMs / 1000.0));
        var intensityLead = IntensityLeadScale(config.CueIntensity);
        leadMeters *= intensityLead;

        TrailbrakeCornerCue? upcoming = null;
        double? metersToBrake = null;
        double brakeDist = 0;

        foreach (var corner in _plan.Corners.OrderBy(item => item.StartFrac))
        {
            if (corner.BrakeOnDist is double on)
            {
                brakeDist = on;
            }
            else if (trackLength > 1)
            {
                brakeDist = corner.StartFrac * trackLength;
            }
            else
            {
                continue;
            }

            var delta = brakeDist - lapDistance;
            if (delta < -trackLength * 0.5 && trackLength > 1)
            {
                delta += trackLength;
            }

            if (delta < -8) continue;
            upcoming = corner;
            metersToBrake = delta;
            break;
        }

        if (upcoming is null || metersToBrake is null)
        {
            return new CueSnapshot("armed", null, null, "Waiting for next corner.", null, _referenceLapId, false, null, false, null);
        }

        var phases = BuildPhases(upcoming, brakeDist, trackLength, config);
        ModulationMark? due = null;
        foreach (var phaseMark in phases)
        {
            var delta = phaseMark.Distance - lapDistance;
            if (delta < -trackLength * 0.5 && trackLength > 1) delta += trackLength;
            // Fire once we are within a small window past the mark (or at/after it within 12 m).
            if (delta <= 6 && delta >= -12)
            {
                var key = $"{_lastLapNumber}|{upcoming.Name}|{phaseMark.Phase}";
                if (_fired.Contains(key)) continue;
                due = phaseMark with { MetersTo = delta };
                break;
            }
        }

        // Also surface approach when still approaching brake-on within lead window.
        if (due is null && metersToBrake.Value <= leadMeters + 40)
        {
            var approachKey = $"{_lastLapNumber}|{upcoming.Name}|approach";
            if (!_fired.Contains(approachKey) && metersToBrake.Value <= leadMeters)
            {
                due = new ModulationMark("approach", brakeDist, metersToBrake.Value);
            }
            else if (metersToBrake.Value <= leadMeters + 40)
            {
                // Keep HUD armed/calling without re-firing audio.
                var inWindow = metersToBrake.Value <= leadMeters + 40;
                return new CueSnapshot(
                    inWindow ? "calling" : "armed",
                    upcoming.Name,
                    Math.Round(metersToBrake.Value, 1),
                    upcoming.TipText,
                    upcoming.CallText,
                    _referenceLapId,
                    false,
                    CurrentDisplayedPhase(upcoming, lapDistance, brakeDist, trackLength, config),
                    false,
                    null);
            }
        }

        if (due is null)
        {
            var inWindow = metersToBrake.Value <= leadMeters + 40;
            return new CueSnapshot(
                inWindow ? "calling" : "armed",
                upcoming.Name,
                Math.Round(metersToBrake.Value, 1),
                upcoming.TipText,
                upcoming.CallText,
                _referenceLapId,
                false,
                CurrentDisplayedPhase(upcoming, lapDistance, brakeDist, trackLength, config),
                false,
                null);
        }

        var mark = due.Value;
        var fireKey = $"{_lastLapNumber}|{upcoming.Name}|{mark.Phase}";
        _fired.Add(fireKey);

        var shouldSpeak = mark.Phase == "approach"
            && config.VoiceEnabled
            && !string.Equals(_spokenCorner, upcoming.Name, StringComparison.OrdinalIgnoreCase);
        if (shouldSpeak) _spokenCorner = upcoming.Name;

        var shouldPlay = config.SoundEnabled && (config.ModulationEnabled || mark.Phase == "approach");

        return new CueSnapshot(
            State: "calling",
            CornerName: upcoming.Name,
            MetersToBrake: Math.Round(metersToBrake.Value, 1),
            TipText: upcoming.TipText,
            CallText: upcoming.CallText,
            ReferenceLapId: _referenceLapId,
            ShouldSpeak: shouldSpeak,
            Phase: mark.Phase,
            ShouldPlaySound: shouldPlay,
            SoundKind: mark.Phase);
    }

    private CueSnapshot Idle(string state) =>
        new(state, null, null, null, null, _referenceLapId, false, null, false, null);

    private static double IntensityLeadScale(string intensity) => intensity switch
    {
        "calm" => 0.85,
        "urgent" => 1.25,
        _ => 1.0,
    };

    private static IReadOnlyList<ModulationMark> BuildPhases(
        TrailbrakeCornerCue corner,
        double brakeDist,
        double trackLength,
        TrailbrakeConfig config)
    {
        var marks = new List<ModulationMark>
        {
            new("approach", brakeDist, 0),
        };

        if (!config.ModulationEnabled)
        {
            return marks;
        }

        var intensity = config.CueIntensity;
        marks.Add(new("brake-on", brakeDist, 0));

        if (intensity is "normal" or "urgent")
        {
            var trail = corner.TrailStartDist ?? corner.PeakBrakeDist ?? (brakeDist + 12);
            marks.Add(new("trail", trail, 0));
            var release = corner.BrakeOffDist ?? (trail + 20);
            marks.Add(new("release", release, 0));
        }

        if (intensity == "urgent")
        {
            double exitDist;
            if (corner.ThrottleOnDist is double throttleOn)
            {
                exitDist = throttleOn;
            }
            else if (corner.BrakeOffDist is double brakeOff)
            {
                exitDist = brakeOff + 10;
            }
            else
            {
                exitDist = trackLength > 1 ? corner.EndFrac * trackLength : brakeDist + 40;
            }

            marks.Add(new("exit", exitDist, 0));
        }

        return marks.OrderBy(m => m.Distance).ToArray();
    }

    private static string? CurrentDisplayedPhase(
        TrailbrakeCornerCue corner,
        double lapDistance,
        double brakeDist,
        double trackLength,
        TrailbrakeConfig config)
    {
        if (!config.ModulationEnabled) return lapDistance + 8 >= brakeDist ? "brake-on" : "approach";
        var phases = BuildPhases(corner, brakeDist, trackLength, config);
        string? last = "approach";
        foreach (var mark in phases.OrderBy(m => m.Distance))
        {
            if (lapDistance + 4 >= mark.Distance) last = mark.Phase;
            else break;
        }
        return last;
    }

    private static double EstimateTrackLength(TrailbrakeCuePlan plan)
    {
        double max = 0;
        foreach (var corner in plan.Corners)
        {
            foreach (var value in new double?[] { corner.BrakeOffDist, corner.PeakBrakeDist, corner.BrakeOnDist, corner.ThrottleOnDist })
            {
                if (value is double number) max = Math.Max(max, number);
            }
        }

        return max > 0 ? max / 0.95 : 0;
    }

    private readonly record struct ModulationMark(string Phase, double Distance, double MetersTo);
}
