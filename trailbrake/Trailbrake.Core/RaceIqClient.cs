using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trailbrake;

public sealed class RaceIqClient : IDisposable
{
    private static readonly Candidate[] DefaultCandidates =
    [
        new("http://127.0.0.1:3117"),
        new("http://localhost:3117"),
        new("http://127.0.0.1:1355", "raceiq.localhost"),
        new("http://localhost:1355", "raceiq.localhost"),
        new("http://raceiq.localhost:1355"),
    ];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient _http = new()
    {
        Timeout = TimeSpan.FromSeconds(2),
    };

    private Candidate? _active;

    public IReadOnlyList<Candidate> Candidates { get; }

    public RaceIqClient(IEnumerable<Candidate>? candidates = null)
    {
        var list = new List<Candidate>();
        var fromEnv = Environment.GetEnvironmentVariable("TRAILBRAKE_RACEIQ_URL");
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            list.Add(new Candidate(fromEnv.TrimEnd('/')));
        }

        list.AddRange(candidates ?? DefaultCandidates);
        Candidates = Deduplicate(list);
    }

    public async Task<RaceIqStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        foreach (var candidate in Candidates)
        {
            try
            {
                using var response = await SendAsync(candidate, "/api/status", cancellationToken);
                if (response is null || !response.IsSuccessStatusCode) continue;
                var body = await response.Content.ReadFromJsonAsync<StatusPayload>(JsonOptions, cancellationToken);
                if (body is null) continue;
                _active = candidate;
                var displayUrl = candidate.HostHeader is null
                    ? candidate.BaseUrl
                    : $"{candidate.BaseUrl} (Host {candidate.HostHeader})";
                return new RaceIqStatus(
                    Connected: true,
                    BaseUrl: displayUrl,
                    RequestBaseUrl: candidate.BaseUrl,
                    HostHeader: candidate.HostHeader,
                    PacketsPerSec: body.PacketsPerSec,
                    DetectedGameId: body.DetectedGame?.Id,
                    DetectedGameName: body.DetectedGame?.Name,
                    SessionId: body.CurrentSession?.Id,
                    CarOrdinal: body.CurrentSession?.CarOrdinal,
                    TrackOrdinal: body.CurrentSession?.TrackOrdinal,
                    Error: null);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
            {
                // Try the next candidate.
            }
        }

        _active = null;
        return new RaceIqStatus(false, null, null, null, 0, null, null, null, null, null, "RaceIQ is not reachable on the usual local ports.");
    }

    public async Task<TrailbrakeConfig> GetConfigAsync(CancellationToken cancellationToken = default)
    {
        var candidate = await EnsureActiveAsync(cancellationToken);
        if (candidate is null) return TrailbrakeConfig.Defaults;
        try
        {
            using var response = await SendAsync(candidate.Value, "/api/trailbrake/config", cancellationToken);
            if (response is null || !response.IsSuccessStatusCode) return TrailbrakeConfig.Defaults;
            var body = await response.Content.ReadFromJsonAsync<ConfigPayload>(JsonOptions, cancellationToken);
            if (body is null) return TrailbrakeConfig.Defaults;
            return new TrailbrakeConfig(
                body.Enabled,
                body.HudEnabled,
                body.VoiceEnabled,
                body.PortableMirror,
                body.CueLeadMs <= 0 ? 1200 : body.CueLeadMs,
                body.HudOpacity <= 0 ? 0.85 : body.HudOpacity,
                body.HudScale <= 0 ? 1 : body.HudScale,
                string.IsNullOrWhiteSpace(body.HudPosition) ? "bottom-center" : body.HudPosition,
                string.IsNullOrWhiteSpace(body.ReferencePreference) ? "analysed-fastest" : body.ReferencePreference,
                body.SoundEnabled,
                body.SoundVolume is > 0 and <= 1 ? body.SoundVolume : 0.7,
                string.IsNullOrWhiteSpace(body.SoundPack) ? "click" : body.SoundPack,
                body.ModulationEnabled,
                string.IsNullOrWhiteSpace(body.CueIntensity) ? "normal" : body.CueIntensity);
        }
        catch
        {
            return TrailbrakeConfig.Defaults;
        }
    }

    public async Task<TrailbrakeReferenceLap?> GetReferenceAsync(
        string gameId,
        int? sessionId,
        int? carOrdinal,
        int? trackOrdinal,
        string preference,
        CancellationToken cancellationToken = default)
    {
        var candidate = await EnsureActiveAsync(cancellationToken);
        if (candidate is null) return null;
        var query = $"gameId={Uri.EscapeDataString(gameId)}&preference={Uri.EscapeDataString(preference)}";
        if (sessionId is int exclude) query += $"&excludeSessionId={exclude}";
        if (carOrdinal is int car) query += $"&carOrdinal={car}";
        if (trackOrdinal is int track) query += $"&trackOrdinal={track}";
        using var response = await SendAsync(candidate.Value, $"/api/trailbrake/reference?{query}", cancellationToken);
        if (response is null || !response.IsSuccessStatusCode) return null;
        var body = await response.Content.ReadFromJsonAsync<ReferencePayload>(JsonOptions, cancellationToken);
        var reference = body?.Reference;
        if (reference is null) return null;
        return new TrailbrakeReferenceLap(reference.LapId, reference.SessionId, reference.LapTime, reference.HasAnalysis, reference.TuneId);
    }

    public async Task<TrailbrakeCuePlan?> GetCuePlanAsync(int lapId, CancellationToken cancellationToken = default)
    {
        var candidate = await EnsureActiveAsync(cancellationToken);
        if (candidate is null) return null;
        using var response = await SendAsync(candidate.Value, $"/api/trailbrake/cue-plan/{lapId}", cancellationToken);
        if (response is null || !response.IsSuccessStatusCode) return null;
        var body = await response.Content.ReadFromJsonAsync<CuePlanPayload>(JsonOptions, cancellationToken);
        var plan = body?.Plan;
        if (plan?.Corners is null) return null;
        var corners = plan.Corners.Select(corner => new TrailbrakeCornerCue(
            corner.Name ?? "Corner",
            corner.StartFrac,
            corner.EndFrac,
            corner.BrakeOnDist,
            corner.PeakBrakeDist,
            corner.BrakeOffDist,
            corner.TrailStartDist,
            corner.ThrottleOnDist,
            corner.Severity ?? "info",
            corner.CallText ?? $"Brake {corner.Name}",
            corner.TipText ?? "")).ToArray();
        return new TrailbrakeCuePlan(plan.LapId, plan.TrackLengthM, plan.HasAnalysis, corners, plan.BuiltAt ?? "");
    }

    public async Task<TrailbrakeLiveSample?> GetLiveAsync(CancellationToken cancellationToken = default)
    {
        var candidate = await EnsureActiveAsync(cancellationToken);
        if (candidate is null) return null;
        using var response = await SendAsync(candidate.Value, "/api/trailbrake/live", cancellationToken);
        if (response is null || !response.IsSuccessStatusCode) return null;
        var body = await response.Content.ReadFromJsonAsync<LivePayload>(JsonOptions, cancellationToken);
        if (body is null) return null;
        return new TrailbrakeLiveSample(body.SessionId, body.DistanceTraveled, body.SpeedMps, body.Brake, body.LapNumber, body.CurrentLapTime);
    }

    public void Dispose() => _http.Dispose();

    public readonly record struct Candidate(string BaseUrl, string? HostHeader = null);

    private async Task<Candidate?> EnsureActiveAsync(CancellationToken cancellationToken)
    {
        if (_active is not null) return _active;
        var status = await GetStatusAsync(cancellationToken);
        return status.Connected ? _active : null;
    }

    private async Task<HttpResponseMessage?> SendAsync(Candidate candidate, string path, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{candidate.BaseUrl}{path}");
        if (!string.IsNullOrWhiteSpace(candidate.HostHeader))
        {
            request.Headers.Host = candidate.HostHeader;
        }

        return await _http.SendAsync(request, cancellationToken);
    }

    private static IReadOnlyList<Candidate> Deduplicate(IEnumerable<Candidate> candidates)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var list = new List<Candidate>();
        foreach (var candidate in candidates)
        {
            var key = $"{candidate.BaseUrl}|{candidate.HostHeader}";
            if (!seen.Add(key)) continue;
            list.Add(new Candidate(candidate.BaseUrl.TrimEnd('/'), candidate.HostHeader));
        }

        return list;
    }

    private sealed class StatusPayload
    {
        [JsonPropertyName("packetsPerSec")]
        public double PacketsPerSec { get; set; }

        [JsonPropertyName("detectedGame")]
        public DetectedGamePayload? DetectedGame { get; set; }

        [JsonPropertyName("currentSession")]
        public SessionPayload? CurrentSession { get; set; }
    }

    private sealed class DetectedGamePayload
    {
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [JsonPropertyName("name")]
        public string? Name { get; set; }
    }

    private sealed class SessionPayload
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("carOrdinal")]
        public int CarOrdinal { get; set; }

        [JsonPropertyName("trackOrdinal")]
        public int TrackOrdinal { get; set; }
    }

    private sealed class ConfigPayload
    {
        public bool Enabled { get; set; } = true;
        public bool HudEnabled { get; set; } = true;
        public bool VoiceEnabled { get; set; } = true;
        public bool PortableMirror { get; set; } = true;
        public int CueLeadMs { get; set; } = 1200;
        public double HudOpacity { get; set; } = 0.85;
        public double HudScale { get; set; } = 1;
        public string? HudPosition { get; set; }
        public string? ReferencePreference { get; set; }
        public bool SoundEnabled { get; set; } = true;
        public double SoundVolume { get; set; } = 0.7;
        public string? SoundPack { get; set; }
        public bool ModulationEnabled { get; set; } = true;
        public string? CueIntensity { get; set; }
    }

    private sealed class ReferencePayload
    {
        public ReferenceLapPayload? Reference { get; set; }
    }

    private sealed class ReferenceLapPayload
    {
        public int LapId { get; set; }
        public int SessionId { get; set; }
        public double LapTime { get; set; }
        public bool HasAnalysis { get; set; }
        public int? TuneId { get; set; }
    }

    private sealed class CuePlanPayload
    {
        public CuePlanBody? Plan { get; set; }
    }

    private sealed class CuePlanBody
    {
        public int LapId { get; set; }
        public double? TrackLengthM { get; set; }
        public bool HasAnalysis { get; set; }
        public List<CueCornerPayload>? Corners { get; set; }
        public string? BuiltAt { get; set; }
    }

    private sealed class CueCornerPayload
    {
        public string? Name { get; set; }
        public double StartFrac { get; set; }
        public double EndFrac { get; set; }
        public double? BrakeOnDist { get; set; }
        public double? PeakBrakeDist { get; set; }
        public double? BrakeOffDist { get; set; }
        public double? TrailStartDist { get; set; }
        public double? ThrottleOnDist { get; set; }
        public string? Severity { get; set; }
        public string? CallText { get; set; }
        public string? TipText { get; set; }
    }

    private sealed class LivePayload
    {
        public int? SessionId { get; set; }
        public double DistanceTraveled { get; set; }
        public double SpeedMps { get; set; }
        public double Brake { get; set; }
        public int LapNumber { get; set; }
        public double CurrentLapTime { get; set; }
    }
}
