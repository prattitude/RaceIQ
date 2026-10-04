import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";

const COMPANION_STALE_MS = 5_000;

function trailbrakeDir(): string {
  const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  return join(localAppData, "Trailbrake");
}

function readJsonFile(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Local Trailbrake companion status for the RaceIQ Settings panel. */
export const trailbrakeRoutes = new Hono()
  .get("/api/trailbrake/status", (c) => {
    const dir = trailbrakeDir();
    const companionPath = join(dir, "companion-status.json");
    const npuPath = join(dir, "npu-capability.json");
    const companionRaw = asRecord(readJsonFile(companionPath));
    const npuRaw = asRecord(readJsonFile(npuPath));

    const updatedAt = typeof companionRaw?.updatedAtUtc === "string" ? Date.parse(companionRaw.updatedAtUtc) : NaN;
    const fresh = Number.isFinite(updatedAt) && Date.now() - updatedAt <= COMPANION_STALE_MS;
    const companionRunning = fresh && companionRaw?.companionRunning === true;

    return c.json({
      available: companionRaw != null || npuRaw != null,
      companionRunning,
      companionStatusPath: companionPath,
      npuCapabilityPath: npuPath,
      npuFeaturesEnabled: companionRaw?.npuFeaturesEnabled === true
        || npuRaw?.npuFeaturesEnabled === true,
      npuProvider: typeof companionRaw?.npuProvider === "string"
        ? companionRaw.npuProvider
        : null,
      raceIq: companionRaw?.raceIq ?? null,
      forecast: companionRaw?.forecast ?? null,
      recommendation: npuRaw?.recommendation ?? null,
      updatedAtUtc: typeof companionRaw?.updatedAtUtc === "string" ? companionRaw.updatedAtUtc : null,
      npuCapturedAtUtc: typeof npuRaw?.capturedAtUtc === "string" ? npuRaw.capturedAtUtc : null,
    });
  });
