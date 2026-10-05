using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trailbrake;

public sealed record CompanionStatus(
    bool CompanionRunning,
    bool NpuFeaturesEnabled,
    string? NpuProvider,
    RaceIqLinkStatus RaceIq,
    ForecastStatus Forecast,
    CueStatus Cue,
    DateTimeOffset UpdatedAtUtc
);

public sealed record RaceIqLinkStatus(
    bool Connected,
    string? BaseUrl,
    double PacketsPerSec,
    string? DetectedGameId,
    string? DetectedGameName,
    int? SessionId,
    int? CarOrdinal,
    int? TrackOrdinal,
    string? Error
);

public sealed record ForecastStatus(
    string State,
    string Message
);

public sealed record CueStatus(
    string State,
    string? CornerName,
    double? MetersToBrake,
    string? TipText,
    int? ReferenceLapId,
    bool HudEnabled,
    string? Phase
);

public static class CompanionStatusStore
{
    public const string ForecastUnavailable = "unavailable";
    public const string ForecastWaitingSession = "waiting-session";
    public const string ForecastArmed = "armed";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static CompanionStatus Build(
        NpuCapabilityReport npu,
        RaceIqStatus raceIq,
        CueSnapshot cue,
        TrailbrakeConfig config)
    {
        var provider = npu.Recommendation.ProviderName
            ?? npu.Providers.FirstOrDefault(item => item.RecommendedForThisPc)?.Name;
        var forecast = !npu.NpuFeaturesEnabled || !config.Enabled
            ? new ForecastStatus(ForecastUnavailable, "Trailbrake features are off.")
            : raceIq.Connected && raceIq.SessionId is not null
                ? new ForecastStatus(ForecastArmed, cue.ReferenceLapId is int id
                    ? $"Armed with reference lap #{id}."
                    : "Armed. Looking for a reference lap…")
                : new ForecastStatus(ForecastWaitingSession, "NPU ready. Waiting for RaceIQ to start a driving session.");

        return new CompanionStatus(
            CompanionRunning: true,
            NpuFeaturesEnabled: npu.NpuFeaturesEnabled && config.Enabled,
            NpuProvider: provider,
            RaceIq: new RaceIqLinkStatus(
                raceIq.Connected,
                raceIq.BaseUrl,
                raceIq.PacketsPerSec,
                raceIq.DetectedGameId,
                raceIq.DetectedGameName,
                raceIq.SessionId,
                raceIq.CarOrdinal,
                raceIq.TrackOrdinal,
                raceIq.Error),
            Forecast: forecast,
            Cue: new CueStatus(
                cue.State,
                cue.CornerName,
                cue.MetersToBrake,
                cue.TipText,
                cue.ReferenceLapId,
                config.HudEnabled,
                cue.Phase),
            UpdatedAtUtc: DateTimeOffset.UtcNow);
    }

    public static string ToJson(CompanionStatus status) => JsonSerializer.Serialize(status, JsonOptions);

    public static void Write(CompanionStatus status)
    {
        TrailbrakePaths.EnsureRoot();
        File.WriteAllText(TrailbrakePaths.CompanionStatusPath, ToJson(status));
    }
}
