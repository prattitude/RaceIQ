import { DashShell } from "./dash-shell";

export type TrailbrakeDashCue = {
  state?: string;
  cornerName?: string | null;
  metersToBrake?: number | null;
  tipText?: string | null;
  referenceLapId?: number | null;
  hudEnabled?: boolean;
};

export function TrailbrakeDash({
  companionRunning,
  npuReady,
  cue,
}: {
  companionRunning: boolean;
  npuReady: boolean;
  cue: TrailbrakeDashCue | null;
}) {
  const corner = cue?.cornerName ?? "";
  const meters = cue?.metersToBrake;
  const tip = cue?.tipText ?? "";
  const chip = cue?.referenceLapId != null ? `REF #${cue.referenceLapId}` : companionRunning ? "ARMED" : "OFFLINE";

  return (
    <DashShell className="flex items-end justify-center pb-[8vh]">
      <div className="w-[min(36rem,92vw)] rounded-md border border-app-border bg-app-bg/90 px-5 py-4 shadow-none backdrop-blur-sm">
        <div className="mb-1 text-xs font-semibold tracking-widest text-app-text-muted uppercase">
          {chip}
          {!npuReady ? " · NPU OFF" : ""}
        </div>
        {corner ? (
          <div className="flex items-end justify-between gap-4">
            <div className="font-mono text-3xl font-bold tracking-tight text-app-text">{corner}</div>
            <div className="font-mono text-3xl font-bold text-app-accent">
              {meters != null ? `${Math.max(0, Math.round(meters))} m` : "—"}
            </div>
          </div>
        ) : (
          <div className="text-sm text-app-text-muted">
            {companionRunning ? "Waiting for approach…" : "Start the Trailbrake companion"}
          </div>
        )}
        {tip ? <p className="mt-2 line-clamp-2 text-sm text-app-text-secondary">{tip}</p> : null}
        {cue?.state ? <p className="mt-1 font-mono text-app-micro text-app-text-muted">{cue.state}</p> : null}
      </div>
    </DashShell>
  );
}
