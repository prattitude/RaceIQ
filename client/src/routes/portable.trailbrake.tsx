import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { TrailbrakeDash } from "../components/dashes/TrailbrakeDash";
import { client } from "@/lib/rpc";
import { useSettings } from "@/hooks/settings";

type TrailbrakeStatus = {
  companionRunning: boolean;
  npuFeaturesEnabled: boolean;
  cue?: {
    state?: string;
    cornerName?: string | null;
    metersToBrake?: number | null;
    tipText?: string | null;
    referenceLapId?: number | null;
    hudEnabled?: boolean;
  } | null;
};

function TrailbrakePortableRoute() {
  const { displaySettings } = useSettings();
  const mirrorAllowed = displaySettings.trailbrakePortableMirror !== false;

  const { data } = useQuery({
    queryKey: ["trailbrake-status-portable"],
    queryFn: async () => {
      const res = await client.api.trailbrake.status.$get();
      if (!res.ok) throw new Error(res.statusText);
      return res.json() as Promise<TrailbrakeStatus>;
    },
    refetchInterval: 100,
    enabled: mirrorAllowed,
  });

  if (!mirrorAllowed) {
    return (
      <div className="flex h-full items-center justify-center bg-app-bg text-sm text-app-text-muted">
        Portable Trailbrake mirror is disabled in Settings.
      </div>
    );
  }

  return (
    <TrailbrakeDash
      companionRunning={Boolean(data?.companionRunning)}
      npuReady={Boolean(data?.npuFeaturesEnabled)}
      cue={data?.cue ?? null}
    />
  );
}

export const Route = createFileRoute("/portable/trailbrake")({
  component: TrailbrakePortableRoute,
});
