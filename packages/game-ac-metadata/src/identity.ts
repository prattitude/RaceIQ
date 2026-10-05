/** Stable FNV-1a ordinals from AC static car/track folder names (no CSV catalog yet). */

const carNames = new Map<number, string>();
const trackNames = new Map<number, string>();
const trackOrdinals = new Map<string, number>();

export function stableAcOrdinal(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Keep in signed-positive int32 range used by other Kunos ordinals.
  return (h >>> 0) % 2_000_000_000;
}

export function rememberAcCar(model: string): number {
  const key = model.trim();
  if (!key) return -1;
  const ordinal = stableAcOrdinal(key.toLowerCase());
  carNames.set(ordinal, key);
  return ordinal;
}

export function rememberAcTrack(track: string): number {
  const key = track.trim();
  if (!key) return -1;
  const ordinal = stableAcOrdinal(key.toLowerCase());
  trackNames.set(ordinal, key);
  trackOrdinals.set(key.toLowerCase(), ordinal);
  return ordinal;
}

export function getAcCarName(ordinal: number): string {
  return carNames.get(ordinal) ?? `AC car #${ordinal}`;
}

export function getAcTrackName(ordinal: number): string {
  return trackNames.get(ordinal) ?? `AC track #${ordinal}`;
}

export function getAcTrackOrdinalByName(name: string): number | undefined {
  return trackOrdinals.get(name.trim().toLowerCase());
}
