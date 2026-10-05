namespace Trailbrake;

public sealed class MainForm : Form
{
    private readonly Label _npuLabel = CreateValueLabel();
    private readonly Label _raceIqLabel = CreateValueLabel();
    private readonly Label _sessionLabel = CreateValueLabel();
    private readonly Label _forecastLabel = CreateValueLabel();
    private readonly Label _cueLabel = CreateValueLabel();
    private readonly Label _detailLabel = CreateValueLabel();
    private readonly System.Windows.Forms.Timer _cueTimer = new() { Interval = 50 };
    private readonly System.Windows.Forms.Timer _linkTimer = new() { Interval = 1000 };
    private readonly RaceIqClient _raceIq = new();
    private readonly CueEngine _cues = new();
    private readonly HudForm _hud = new();
    private readonly TtsService _tts = new();
    private readonly CueAudioService _audio = new();
    private NpuCapabilityReport? _npu;
    private TrailbrakeConfig _config = TrailbrakeConfig.Defaults;
    private RaceIqStatus _raceIqStatus = new(false, null, null, null, 0, null, null, null, null, null, null);
    private DateTimeOffset _nextNpuPrepareUtc = DateTimeOffset.MinValue;
    private DateTimeOffset _nextStatusWriteUtc = DateTimeOffset.MinValue;
    private int? _boundSessionId;
    private int? _boundReferenceLapId;
    private bool _cueBusy;
    private bool _linkBusy;
    private CueSnapshot _lastCue = new("waiting-session", null, null, null, null, null, false, null, false, null);

    public MainForm()
    {
        Text = "Trailbrake";
        Width = 560;
        Height = 460;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10f);
        BackColor = Color.FromArgb(18, 20, 24);
        ForeColor = Color.FromArgb(230, 234, 240);

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(20),
            ColumnCount = 1,
            RowCount = 7,
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        for (var i = 0; i < 5; i++) layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        layout.Controls.Add(new Label
        {
            Text = "Trailbrake companion",
            AutoSize = true,
            Font = new Font("Segoe UI Semibold", 14f),
            ForeColor = Color.FromArgb(120, 210, 255),
        }, 0, 0);
        layout.Controls.Add(Labeled("NPU", _npuLabel), 0, 1);
        layout.Controls.Add(Labeled("RaceIQ", _raceIqLabel), 0, 2);
        layout.Controls.Add(Labeled("Session", _sessionLabel), 0, 3);
        layout.Controls.Add(Labeled("Forecast", _forecastLabel), 0, 4);
        layout.Controls.Add(Labeled("Cue", _cueLabel), 0, 5);
        _detailLabel.Dock = DockStyle.Fill;
        layout.Controls.Add(_detailLabel, 0, 6);
        Controls.Add(layout);

        _cueTimer.Tick += async (_, _) => await TickCueAsync();
        _linkTimer.Tick += async (_, _) => await TickLinkAsync();
        Shown += async (_, _) =>
        {
            _detailLabel.Text = "Checking NPU and RaceIQ…";
            _npu = await PrepareNpuAsync(forceEnsure: true);
            File.WriteAllText(TrailbrakePaths.NpuCapabilityPath, NpuCapability.ToJson(_npu));
            await TickLinkAsync();
            _cueTimer.Start();
            _linkTimer.Start();
        };
        FormClosed += (_, _) =>
        {
            _cueTimer.Stop();
            _linkTimer.Stop();
            _hud.Close();
            _tts.Dispose();
            _audio.Dispose();
            _raceIq.Dispose();
        };
    }

    private async Task<NpuCapabilityReport> PrepareNpuAsync(bool forceEnsure)
    {
        var report = NpuCapability.Capture();
        var needsPrepare = report.Recommendation.Action
            is NpuCapability.ActionPrepareProvider
            or NpuCapability.ActionInstallProvider;
        if (needsPrepare && (forceEnsure || DateTimeOffset.UtcNow >= _nextNpuPrepareUtc))
        {
            _nextNpuPrepareUtc = DateTimeOffset.UtcNow.AddSeconds(30);
            await NpuCapability.EnsureRecommendedProviderAsync(report);
            report = NpuCapability.Capture();
        }

        return report;
    }

    private async Task TickLinkAsync()
    {
        if (_linkBusy) return;
        _linkBusy = true;
        try
        {
            if (_npu is null || !_npu.NpuFeaturesEnabled)
            {
                _npu = await PrepareNpuAsync(forceEnsure: _npu is null);
            }

            _config = await _raceIq.GetConfigAsync();
            _hud.ApplyConfig(_config);
            _audio.ApplyConfig(_config);
            _raceIqStatus = await _raceIq.GetStatusAsync();
            await EnsureReferenceAsync(_raceIqStatus);
            UpdateLabels(_raceIqStatus, _lastCue);
            WriteStatusThrottled();
        }
        finally
        {
            _linkBusy = false;
        }
    }

    private async Task TickCueAsync()
    {
        if (_cueBusy || _npu is null) return;
        _cueBusy = true;
        try
        {
            TrailbrakeLiveSample? live = null;
            if (_raceIqStatus.Connected && _raceIqStatus.SessionId is not null && _npu.NpuFeaturesEnabled && _config.Enabled)
            {
                live = await _raceIq.GetLiveAsync();
            }

            _lastCue = _cues.Evaluate(live, _config, _npu.NpuFeaturesEnabled, _raceIqStatus.SessionId is not null);
            if (_lastCue.ShouldSpeak && !string.IsNullOrWhiteSpace(_lastCue.CallText))
            {
                _tts.SpeakAsync(_lastCue.CallText!);
            }

            if (_lastCue.ShouldPlaySound)
            {
                _audio.Play(_lastCue.SoundKind);
            }

            _hud.SetCue(_lastCue, _config.HudEnabled && _config.Enabled && _npu.NpuFeaturesEnabled);
            _cueLabel.Text = _lastCue.CornerName is null
                ? _lastCue.State
                : $"{_lastCue.State}: {_lastCue.CornerName} · {_lastCue.MetersToBrake:0} m"
                  + (_lastCue.Phase is null ? "" : $" · {_lastCue.Phase}");
            if (!string.IsNullOrWhiteSpace(_lastCue.TipText))
            {
                _detailLabel.Text = _lastCue.TipText;
            }

            WriteStatusThrottled();
        }
        finally
        {
            _cueBusy = false;
        }
    }

    private async Task EnsureReferenceAsync(RaceIqStatus raceIq)
    {
        if (!raceIq.Connected || raceIq.SessionId is null || string.IsNullOrWhiteSpace(raceIq.DetectedGameId))
        {
            if (_boundSessionId is not null)
            {
                _boundSessionId = null;
                _boundReferenceLapId = null;
                _cues.ClearReference();
            }

            return;
        }

        if (_boundSessionId == raceIq.SessionId && _boundReferenceLapId is not null) return;

        _boundSessionId = raceIq.SessionId;
        var reference = await _raceIq.GetReferenceAsync(
            raceIq.DetectedGameId,
            raceIq.SessionId,
            raceIq.CarOrdinal,
            raceIq.TrackOrdinal,
            _config.ReferencePreference);
        if (reference is null)
        {
            _boundReferenceLapId = null;
            _cues.ClearReference();
            return;
        }

        var plan = await _raceIq.GetCuePlanAsync(reference.LapId);
        _boundReferenceLapId = reference.LapId;
        _cues.SetReference(reference, plan);
    }

    private void UpdateLabels(RaceIqStatus raceIq, CueSnapshot cue)
    {
        _npuLabel.Text = _npu?.NpuFeaturesEnabled == true
            ? $"Ready ({_npu.Recommendation.ProviderName ?? "NPU"})"
            : "Off — prepare the recommended provider with the probe";
        _npuLabel.ForeColor = _npu?.NpuFeaturesEnabled == true ? Color.FromArgb(120, 220, 160) : Color.FromArgb(240, 140, 120);

        _raceIqLabel.Text = raceIq.Connected
            ? $"Connected ({raceIq.BaseUrl}) · {raceIq.PacketsPerSec:0} pkt/s"
            : raceIq.Error ?? "Not connected";
        _raceIqLabel.ForeColor = raceIq.Connected ? Color.FromArgb(120, 220, 160) : Color.FromArgb(240, 180, 100);

        _sessionLabel.Text = raceIq.SessionId is int sessionId
            ? $"#{sessionId} · {raceIq.DetectedGameName ?? raceIq.DetectedGameId ?? "game"} · car {raceIq.CarOrdinal} · track {raceIq.TrackOrdinal}"
            : raceIq.DetectedGameName is not null
                ? $"{raceIq.DetectedGameName} detected · no active session yet"
                : "No active session";

        var forecastState = !_config.Enabled || _npu?.NpuFeaturesEnabled != true
            ? CompanionStatusStore.ForecastUnavailable
            : raceIq.SessionId is null
                ? CompanionStatusStore.ForecastWaitingSession
                : CompanionStatusStore.ForecastArmed;
        _forecastLabel.Text = forecastState;
        _forecastLabel.ForeColor = forecastState == CompanionStatusStore.ForecastArmed
            ? Color.FromArgb(120, 210, 255)
            : Color.FromArgb(200, 200, 210);

        _cueLabel.Text = cue.CornerName is null
            ? cue.State
            : $"{cue.State}: {cue.CornerName} · {cue.MetersToBrake:0} m";
        _detailLabel.Text = cue.TipText
            ?? (_npu?.NpuFeaturesEnabled == true
                ? "Linked to RaceIQ. Approach cues use a correlated reference lap and its AI analysis."
                : string.Join(Environment.NewLine, _npu?.Recommendation.Steps ?? []));
    }

    private void WriteStatusThrottled()
    {
        if (DateTimeOffset.UtcNow < _nextStatusWriteUtc || _npu is null) return;
        _nextStatusWriteUtc = DateTimeOffset.UtcNow.AddMilliseconds(500);
        CompanionStatusStore.Write(CompanionStatusStore.Build(_npu, _raceIqStatus, _lastCue, _config));
    }

    private static Control Labeled(string title, Label value)
    {
        var panel = new Panel { Dock = DockStyle.Fill };
        var heading = new Label
        {
            Text = title,
            AutoSize = true,
            ForeColor = Color.FromArgb(150, 160, 175),
            Location = new Point(0, 0),
        };
        value.Location = new Point(0, 22);
        value.AutoSize = true;
        panel.Controls.Add(heading);
        panel.Controls.Add(value);
        return panel;
    }

    private static Label CreateValueLabel() => new()
    {
        AutoSize = true,
        MaximumSize = new Size(500, 0),
    };
}
