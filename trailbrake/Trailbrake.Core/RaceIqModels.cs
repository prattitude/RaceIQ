namespace Trailbrake;

public sealed record RaceIqStatus(
    bool Connected,
    string? BaseUrl,
    string? RequestBaseUrl,
    string? HostHeader,
    double PacketsPerSec,
    string? DetectedGameId,
    string? DetectedGameName,
    int? SessionId,
    int? CarOrdinal,
    int? TrackOrdinal,
    string? Error
);

public sealed record TrailbrakeConfig(
    bool Enabled,
    bool HudEnabled,
    bool VoiceEnabled,
    bool PortableMirror,
    int CueLeadMs,
    double HudOpacity,
    double HudScale,
    string HudPosition,
    string ReferencePreference,
    bool SoundEnabled,
    double SoundVolume,
    string SoundPack,
    bool ModulationEnabled,
    string CueIntensity
)
{
    public static TrailbrakeConfig Defaults { get; } = new(
        Enabled: true,
        HudEnabled: true,
        VoiceEnabled: true,
        PortableMirror: true,
        CueLeadMs: 1200,
        HudOpacity: 0.85,
        HudScale: 1,
        HudPosition: "bottom-center",
        ReferencePreference: "analysed-fastest",
        SoundEnabled: true,
        SoundVolume: 0.7,
        SoundPack: "click",
        ModulationEnabled: true,
        CueIntensity: "normal");
}

public sealed record TrailbrakeReferenceLap(
    int LapId,
    int SessionId,
    double LapTime,
    bool HasAnalysis,
    int? TuneId
);

public sealed record TrailbrakeCornerCue(
    string Name,
    double StartFrac,
    double EndFrac,
    double? BrakeOnDist,
    double? PeakBrakeDist,
    double? BrakeOffDist,
    double? TrailStartDist,
    double? ThrottleOnDist,
    string Severity,
    string CallText,
    string TipText
);

public sealed record TrailbrakeCuePlan(
    int LapId,
    double? TrackLengthM,
    bool HasAnalysis,
    IReadOnlyList<TrailbrakeCornerCue> Corners,
    string BuiltAt
);

public sealed record TrailbrakeLiveSample(
    int? SessionId,
    double DistanceTraveled,
    double SpeedMps,
    double Brake,
    int LapNumber,
    double CurrentLapTime
);

/// <summary>Reserved for a future NPU ONNX forecast model.</summary>
public interface IForecastModel
{
    bool IsLoaded { get; }
}
