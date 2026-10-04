import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/rpc";
import { m } from "@/paraglide/messages";

type TrailbrakeStatus = {
  available: boolean;
  companionRunning: boolean;
  npuFeaturesEnabled: boolean;
  npuProvider: string | null;
  raceIq: {
    connected?: boolean;
    baseUrl?: string | null;
    packetsPerSec?: number;
    detectedGameName?: string | null;
    sessionId?: number | null;
    error?: string | null;
  } | null;
  forecast: { state?: string; message?: string } | null;
  recommendation: { action?: string; summary?: string; steps?: string[] } | null;
};

async function fetchTrailbrakeStatus(): Promise<TrailbrakeStatus> {
  const res = await client.api.trailbrake.status.$get();
  if (!res.ok) throw new Error(`Trailbrake status failed (${res.status})`);
  return res.json() as Promise<TrailbrakeStatus>;
}

export function TrailbrakeSection() {
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["trailbrake-status"],
    queryFn: fetchTrailbrakeStatus,
    refetchInterval: 2000,
  });

  return (
    <section className="space-y-6">
      <div>
        <h2 className="mb-1 text-sm font-semibold text-app-text">{m.trailbrake_title()}</h2>
        <p className="mb-4 text-xs text-app-text-muted">{m.trailbrake_desc()}</p>
      </div>

      {!data?.available && (
        <div className="space-y-2 rounded-lg border border-app-border bg-app-surface-alt/50 p-4 text-xs text-app-text-secondary">
          <p>{m.trailbrake_no_status()}</p>
          <p className="font-mono text-app-text-muted">{m.trailbrake_launch_hint()}</p>
        </div>
      )}

      {data?.available && (
        <div className="space-y-3 rounded-lg border border-app-border bg-app-surface-alt/50 p-4 text-xs text-app-text-secondary">
          <StatusRow
            label={data.companionRunning ? m.trailbrake_companion_running() : m.trailbrake_companion_stopped()}
            ok={data.companionRunning}
          />
          <StatusRow
            label={data.npuFeaturesEnabled ? m.trailbrake_npu_ready() : m.trailbrake_npu_off()}
            ok={data.npuFeaturesEnabled}
          />
          {data.npuProvider && (
            <p>
              <span className="text-app-text-muted">{m.trailbrake_provider_label()}: </span>
              <span className="font-mono text-app-text">{data.npuProvider}</span>
            </p>
          )}
          {data.forecast && (
            <p>
              <span className="text-app-text-muted">{m.trailbrake_forecast_label()}: </span>
              <span className="text-app-text">{data.forecast.state} — {data.forecast.message}</span>
            </p>
          )}
          {data.raceIq?.connected && (
            <p className="font-mono text-app-text-muted">
              {data.raceIq.baseUrl} · {Math.round(data.raceIq.packetsPerSec ?? 0)} pkt/s
              {data.raceIq.sessionId != null ? ` · session #${data.raceIq.sessionId}` : ""}
              {data.raceIq.detectedGameName ? ` · ${data.raceIq.detectedGameName}` : ""}
            </p>
          )}
          {!data.companionRunning && (
            <p className="font-mono text-app-text-muted">{m.trailbrake_launch_hint()}</p>
          )}
          {data.recommendation?.summary && !data.npuFeaturesEnabled && (
            <div className="space-y-1 border-t border-app-border pt-3">
              <p className="text-app-text">{data.recommendation.summary}</p>
              {(data.recommendation.steps ?? []).map((step) => (
                <p key={step} className="font-mono text-app-text-muted">{step}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <Button onClick={() => void refetch()} disabled={isFetching}>
        {m.trailbrake_refresh()}
      </Button>
      {error && <p className="text-xs text-status-danger">{error instanceof Error ? error.message : String(error)}</p>}
    </section>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <p className={ok ? "text-status-success" : "text-status-warning"}>
      {label}
    </p>
  );
}
