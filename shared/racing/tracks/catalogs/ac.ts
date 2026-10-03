import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCsvLine } from "@shared/core/csv";
import { GAMES_DIR } from "@shared/platform/runtime/data-paths";

/** One original Assetto Corsa track layout, keyed by its content folder names. */
export interface AcTrack {
  id: number;
  /** `content/tracks/<track>` folder name reported by static.track. */
  track: string;
  /** Layout folder reported by static.trackConfiguration; empty for single-layout tracks. */
  layout: string;
  name: string;
  variant: string;
  commonTrackName: string;
}

let tracks: Map<number, AcTrack> | undefined;

function getTracks(): Map<number, AcTrack> {
  if (tracks) return tracks;
  tracks = new Map();
  const raw = readFileSync(resolve(GAMES_DIR, "ac", "tracks.csv"), "utf-8");
  for (const line of raw.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const id = Number.parseInt(fields[0], 10);
    if (!Number.isInteger(id) || !fields[1]) continue;
    tracks.set(id, {
      id,
      track: fields[1].trim(),
      layout: fields[2]?.trim() ?? "",
      name: fields[3]?.trim() ?? fields[1].trim(),
      variant: fields[4]?.trim() ?? "",
      commonTrackName: fields[5]?.trim() ?? "",
    });
  }
  return tracks;
}

export function getAcTracks(): Map<number, AcTrack> {
  return getTracks();
}

export function getAcTrackName(ordinal: number): string {
  const track = getTracks().get(ordinal);
  if (!track) return `Track #${ordinal}`;
  return track.variant ? `${track.name} - ${track.variant}` : track.name;
}

export function getAcSharedTrackName(ordinal: number): string | undefined {
  return getTracks().get(ordinal)?.commonTrackName || undefined;
}

/** Resolve the exact folder + layout pair AC publishes in its static page. */
export function getAcTrackByIdentity(track: string, layout: string): AcTrack | undefined {
  const folder = track.trim().toLowerCase();
  const config = layout.trim().toLowerCase();
  if (!folder) return undefined;
  for (const candidate of getTracks().values()) {
    if (candidate.track === folder && candidate.layout === config) return candidate;
  }
  return undefined;
}

/** Resolve a stored session track name ("Brands Hatch - Indy") or folder identity. */
export function getAcTrackByName(name: string): AcTrack | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  for (const track of getTracks().values()) {
    const display = (track.variant ? `${track.name} - ${track.variant}` : track.name).toLowerCase();
    const identity = track.layout ? `${track.track}/${track.layout}` : track.track;
    if (display === needle || identity === needle) return track;
  }
  return undefined;
}
