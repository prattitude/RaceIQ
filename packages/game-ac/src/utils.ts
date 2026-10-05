/** Read a null-terminated UTF-16LE (wchar_t) string from a buffer */
export function readWString(buf: Buffer, offset: number, maxBytes: number): string {
  const slice = buf.subarray(offset, offset + maxBytes);
  let end = 0;
  for (let i = 0; i < slice.length - 1; i += 2) {
    if (slice[i] === 0 && slice[i + 1] === 0) break;
    end = i + 2;
  }
  return slice.subarray(0, end).toString("utf16le");
}

/** AC tyreWear is remaining % (~100 new). RaceIQ TireWear is remaining 0..1. */
export function acTireHealth(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return -1;
  if (raw > 1.5) return Math.min(1, Math.max(0, raw / 100));
  return Math.min(1, Math.max(0, raw));
}
