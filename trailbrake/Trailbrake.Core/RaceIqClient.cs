using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trailbrake;

public sealed record RaceIqStatus(
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

public sealed class RaceIqClient : IDisposable
{
    private static readonly Candidate[] DefaultCandidates =
    [
        new("http://127.0.0.1:3117"),
        new("http://localhost:3117"),
        // Portless proxy used by `bun run dev` — Host routes to the RaceIQ backend.
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
                using var request = new HttpRequestMessage(HttpMethod.Get, $"{candidate.BaseUrl}/api/status");
                if (!string.IsNullOrWhiteSpace(candidate.HostHeader))
                {
                    request.Headers.Host = candidate.HostHeader;
                }

                using var response = await _http.SendAsync(request, cancellationToken);
                if (!response.IsSuccessStatusCode) continue;
                var body = await response.Content.ReadFromJsonAsync<StatusPayload>(JsonOptions, cancellationToken);
                if (body is null) continue;
                var displayUrl = candidate.HostHeader is null
                    ? candidate.BaseUrl
                    : $"{candidate.BaseUrl} (Host {candidate.HostHeader})";
                return new RaceIqStatus(
                    Connected: true,
                    BaseUrl: displayUrl,
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

        return new RaceIqStatus(false, null, 0, null, null, null, null, null, "RaceIQ is not reachable on the usual local ports.");
    }

    public void Dispose() => _http.Dispose();

    public readonly record struct Candidate(string BaseUrl, string? HostHeader = null);

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
}
