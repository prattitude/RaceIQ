import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import type { GameId } from "@raceiq/shared/games/ids";
import type { TrailbrakeConfig } from "@raceiq/shared/racing/trailbrake/types";
import { loadSettings } from "@raceiq/backend-core/runtime/config/settings";
import { lapDetector } from "@raceiq/backend-core/telemetry/live-pipeline";
import { wsManager } from "@raceiq/backend-core/runtime/websocket-manager";
import { findTrailbrakeReferenceLap } from "@raceiq/backend-core/trailbrake/reference";
import {
  buildAndSaveTrailbrakeCuePlan,
  getOrBuildTrailbrakeCuePlan,
} from "@raceiq/backend-core/trailbrake/cue-plan";

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

function trailbrakeConfigFromSettings(): TrailbrakeConfig {
  const s = loadSettings();
  return {
    enabled: s.trailbrakeEnabled,
    hudEnabled: s.trailbrakeHudEnabled,
    voiceEnabled: s.trailbrakeVoiceEnabled,
    portableMirror: s.trailbrakePortableMirror,
    cueLeadMs: s.trailbrakeCueLeadMs,
    hudOpacity: s.trailbrakeHudOpacity,
    hudScale: s.trailbrakeHudScale,
    hudPosition: s.trailbrakeHudPosition,
    referencePreference: s.trailbrakeReferencePreference,
    soundEnabled: s.trailbrakeSoundEnabled,
    soundVolume: s.trailbrakeSoundVolume,
    soundPack: s.trailbrakeSoundPack,
    modulationEnabled: s.trailbrakeModulationEnabled,
    cueIntensity: s.trailbrakeCueIntensity,
  };
}

const ReferenceQuerySchema = z.object({
  gameId: z.string().min(1),
  carOrdinal: z.coerce.number().int().optional(),
  trackOrdinal: z.coerce.number().int().optional(),
  carId: z.string().optional(),
  trackId: z.string().optional(),
  excludeSessionId: z.coerce.number().int().optional(),
  preference: z.enum(["analysed-fastest", "fastest"]).optional(),
});

const LapIdParamSchema = z.object({
  lapId: z.coerce.number().int().positive(),
});

/** Local Trailbrake companion status + reference/cue APIs. */
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
      cue: companionRaw?.cue ?? null,
      recommendation: npuRaw?.recommendation ?? null,
      updatedAtUtc: typeof companionRaw?.updatedAtUtc === "string" ? companionRaw.updatedAtUtc : null,
      npuCapturedAtUtc: typeof npuRaw?.capturedAtUtc === "string" ? npuRaw.capturedAtUtc : null,
      config: trailbrakeConfigFromSettings(),
    });
  })
  .get("/api/trailbrake/config", (c) => c.json(trailbrakeConfigFromSettings()))
  .get("/api/trailbrake/live", (c) => {
    const sample = wsManager.getTrailbrakeLiveSample();
    const session = lapDetector.session;
    return c.json({
      sessionId: session?.sessionId ?? null,
      distanceTraveled: sample?.distanceTraveled ?? 0,
      speedMps: sample?.speedMps ?? 0,
      brake: sample?.brake ?? 0,
      lapNumber: sample?.lapNumber ?? 0,
      currentLapTime: sample?.currentLapTime ?? 0,
      updatedAtUtc: sample?.updatedAtUtc ?? null,
    });
  })
  .get("/api/trailbrake/reference", zValidator("query", ReferenceQuerySchema), async (c) => {
    const q = c.req.valid("query");
    const settings = loadSettings();
    const preference = q.preference ?? settings.trailbrakeReferencePreference;
    const reference = await findTrailbrakeReferenceLap({
      gameId: q.gameId as GameId,
      carOrdinal: q.carOrdinal,
      trackOrdinal: q.trackOrdinal,
      carId: q.carId,
      trackId: q.trackId,
      excludeSessionId: q.excludeSessionId,
      preference,
    });
    return c.json({ reference });
  })
  .get("/api/trailbrake/cue-plan/:lapId", zValidator("param", LapIdParamSchema), async (c) => {
    const { lapId } = c.req.valid("param");
    const plan = await getOrBuildTrailbrakeCuePlan(lapId);
    if (!plan) return c.json({ error: "Cue plan unavailable for lap" }, 404);
    return c.json({ plan });
  })
  .post("/api/trailbrake/cue-plan/:lapId/rebuild", zValidator("param", LapIdParamSchema), async (c) => {
    const { lapId } = c.req.valid("param");
    const plan = await buildAndSaveTrailbrakeCuePlan(lapId);
    if (!plan) return c.json({ error: "Cue plan unavailable for lap" }, 404);
    return c.json({ plan });
  });
