import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { client } from "@/lib/rpc";
import { useSaveSettings, useSettings } from "@/hooks/settings";
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
  cue?: {
    state?: string;
    cornerName?: string | null;
    metersToBrake?: number | null;
    tipText?: string | null;
    referenceLapId?: number | null;
  } | null;
  recommendation: { action?: string; summary?: string; steps?: string[] } | null;
};

async function fetchTrailbrakeStatus(): Promise<TrailbrakeStatus> {
  const res = await client.api.trailbrake.status.$get();
  if (!res.ok) throw new Error(`Trailbrake status failed (${res.status})`);
  return res.json() as Promise<TrailbrakeStatus>;
}

export function TrailbrakeSection() {
  const { displaySettings } = useSettings();
  const saveSettings = useSaveSettings();
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

      <div className="space-y-4 rounded-lg border border-app-border bg-app-surface-alt/50 p-4">
        <h3 className="text-xs font-semibold text-app-text">{m.trailbrake_settings_heading()}</h3>
        <ToggleRow
          id="trailbrake-enabled"
          label={m.trailbrake_enabled()}
          checked={displaySettings.trailbrakeEnabled !== false}
          onChange={(checked) => saveSettings.mutate({ trailbrakeEnabled: checked })}
        />
        <ToggleRow
          id="trailbrake-hud"
          label={m.trailbrake_hud_enabled()}
          checked={displaySettings.trailbrakeHudEnabled !== false}
          onChange={(checked) => saveSettings.mutate({ trailbrakeHudEnabled: checked })}
        />
        <ToggleRow
          id="trailbrake-voice"
          label={m.trailbrake_voice_enabled()}
          checked={displaySettings.trailbrakeVoiceEnabled !== false}
          onChange={(checked) => saveSettings.mutate({ trailbrakeVoiceEnabled: checked })}
        />
        <ToggleRow
          id="trailbrake-portable"
          label={m.trailbrake_portable_mirror()}
          checked={displaySettings.trailbrakePortableMirror !== false}
          onChange={(checked) => saveSettings.mutate({ trailbrakePortableMirror: checked })}
        />
        <ToggleRow
          id="trailbrake-modulation"
          label={m.trailbrake_modulation_enabled()}
          checked={displaySettings.trailbrakeModulationEnabled !== false}
          onChange={(checked) => saveSettings.mutate({ trailbrakeModulationEnabled: checked })}
        />
        <ToggleRow
          id="trailbrake-sound"
          label={m.trailbrake_sound_enabled()}
          checked={displaySettings.trailbrakeSoundEnabled !== false}
          onChange={(checked) => saveSettings.mutate({ trailbrakeSoundEnabled: checked })}
        />
        <div className="max-w-xs space-y-1">
          <Label className="text-xs text-app-text-muted">{m.trailbrake_sound_pack()}</Label>
          <SearchSelect
            value={displaySettings.trailbrakeSoundPack ?? "click"}
            onChange={(value) => saveSettings.mutate({ trailbrakeSoundPack: value })}
            options={[
              { value: "click", label: m.trailbrake_sound_pack_click() },
              { value: "hat", label: m.trailbrake_sound_pack_hat() },
              { value: "pulse", label: m.trailbrake_sound_pack_pulse() },
            ]}
          />
        </div>
        <NumberField
          id="trailbrake-sound-volume"
          label={m.trailbrake_sound_volume()}
          min={0}
          max={1}
          step={0.05}
          value={displaySettings.trailbrakeSoundVolume ?? 0.7}
          onChange={(value) => saveSettings.mutate({ trailbrakeSoundVolume: value })}
        />
        <div className="max-w-xs space-y-1">
          <Label className="text-xs text-app-text-muted">{m.trailbrake_cue_intensity()}</Label>
          <SearchSelect
            value={displaySettings.trailbrakeCueIntensity ?? "normal"}
            onChange={(value) => saveSettings.mutate({ trailbrakeCueIntensity: value })}
            options={[
              { value: "calm", label: m.trailbrake_intensity_calm() },
              { value: "normal", label: m.trailbrake_intensity_normal() },
              { value: "urgent", label: m.trailbrake_intensity_urgent() },
            ]}
          />
        </div>
        <div className="max-w-xs space-y-1">
          <Label htmlFor="trailbrake-lead" className="text-xs text-app-text-muted">{m.trailbrake_cue_lead()}</Label>
          <input
            id="trailbrake-lead"
            type="number"
            min={200}
            max={5000}
            step={100}
            className="w-full rounded-md border border-app-border bg-app-bg px-2 py-1.5 text-xs text-app-text"
            value={displaySettings.trailbrakeCueLeadMs ?? 1200}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) saveSettings.mutate({ trailbrakeCueLeadMs: value });
            }}
          />
        </div>
        <div className="max-w-xs space-y-1">
          <Label className="text-xs text-app-text-muted">{m.trailbrake_hud_position()}</Label>
          <SearchSelect
            value={displaySettings.trailbrakeHudPosition ?? "bottom-center"}
            onChange={(value) => saveSettings.mutate({ trailbrakeHudPosition: value })}
            options={[
              { value: "bottom-center", label: m.trailbrake_position_bottom() },
              { value: "top-center", label: m.trailbrake_position_top() },
            ]}
          />
        </div>
        <div className="max-w-xs space-y-1">
          <Label className="text-xs text-app-text-muted">{m.trailbrake_reference_pref()}</Label>
          <SearchSelect
            value={displaySettings.trailbrakeReferencePreference ?? "analysed-fastest"}
            onChange={(value) => saveSettings.mutate({ trailbrakeReferencePreference: value })}
            options={[
              { value: "analysed-fastest", label: m.trailbrake_ref_analysed() },
              { value: "fastest", label: m.trailbrake_ref_fastest() },
            ]}
          />
        </div>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <NumberField
            id="trailbrake-opacity"
            label={m.trailbrake_hud_opacity()}
            min={0.35}
            max={1}
            step={0.05}
            value={displaySettings.trailbrakeHudOpacity ?? 0.85}
            onChange={(value) => saveSettings.mutate({ trailbrakeHudOpacity: value })}
          />
          <NumberField
            id="trailbrake-scale"
            label={m.trailbrake_hud_scale()}
            min={0.75}
            max={1.5}
            step={0.05}
            value={displaySettings.trailbrakeHudScale ?? 1}
            onChange={(value) => saveSettings.mutate({ trailbrakeHudScale: value })}
          />
        </div>
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
          {data.cue && (
            <p>
              <span className="text-app-text-muted">{m.trailbrake_cue_label()}: </span>
              <span className="text-app-text">
                {data.cue.state}
                {data.cue.cornerName ? ` · ${data.cue.cornerName}` : ""}
                {data.cue.metersToBrake != null ? ` · ${Math.round(data.cue.metersToBrake)} m` : ""}
              </span>
            </p>
          )}
          {data.cue?.referenceLapId != null && (
            <p className="font-mono text-app-text-muted">
              {m.trailbrake_reference_label()}: #{data.cue.referenceLapId}
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

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-xs text-app-text-secondary">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-app-text-muted">{label}</Label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        className="w-full rounded-md border border-app-border bg-app-bg px-2 py-1.5 text-xs text-app-text"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <p className={ok ? "text-status-success" : "text-status-warning"}>
      {label}
    </p>
  );
}
