import type { ServerGameAdapter } from "../types";
import type { TelemetryPacket } from "../../../shared/telemetry/types";
import type { LapIndexPacket } from "../../lap-detection/types";
import { acAdapter } from "../../../shared/games/ac";
import { getAcCarName } from "../../../shared/racing/cars/ac";
import { getAcSharedTrackName, getAcTrackByName, getAcTrackName } from "../../../shared/racing/tracks/catalogs/ac";
import { AC_PACKED_MAGIC, unpackTriplet } from "../kunos/pack-triplet";
import { renderAnalystSchemaForPrompt } from "../../ai/schemas";
import { buildAcAiContext } from "./ai-context";
import { LapDetectorAc } from "./lap-detector";
import { parseAcLapIndex } from "./lap-index";
import { parseAcBuffers, resolveAcIdentity } from "./parser";

const AC_SYSTEM_PROMPT = `You are an expert motorsport engineer and data analyst specializing in the original Assetto Corsa.

You are analyzing telemetry data from a lap in Assetto Corsa. Your role is to provide specific, actionable advice to improve lap time.

Your response MUST be valid JSON matching this exact schema. Output ONLY the JSON object, no markdown fences, no extra text.

${renderAnalystSchemaForPrompt()}

CATEGORY GUIDELINES:
- "pace": 4-6 items covering speed, throttle %, braking efficiency, full-throttle time, gear usage. Each with a concrete value.
- "handling": 4-6 items covering tyre core and inner/middle/outer surface temps, pressures, oversteer/understeer, weight transfer. Each with a concrete value.
- "corners": Top 3-5 problem corners where time is being lost. Include speed numbers.
- "technique": 3-5 actionable driving tips. Adapt to the car (road car, classic, GT, open-wheel). Consider trail-braking on entry and throttle modulation on exit.
- "setup": 6-12 specific component adjustments with concrete \`current\` and \`target\` values (psi with one decimal for tyre pressures). Each entry MUST include \`symptom\` (data-cited), \`fix\`, and \`direction\`. Aim for coverage across categories where data supports a change: (a) Tyre pressures (all four), (b) Camber, (c) Brake bias, (d) Anti-roll bars, (e) Springs and dampers, (f) Ride height, (g) Differential. Skip only categories that are genuinely on-target.

AC-SPECIFIC RULES:
- AC publishes no slip-angle, slip-ratio, tyre-wear, or brake-temperature channels; do not infer or quote them.
- Tyre surface temperatures are reported inner/middle/outer: >5°C hotter inside suggests too much negative camber; >5°C hotter outside suggests too little.
- Reference the tyre compound when recommending pressures; optimal windows differ between road, semi-slick, and slick compounds.
- Reference specific numbers from the data — don't be vague.
- Address the driver as "you".
- Output ONLY valid JSON, nothing else.`;

export const acServerAdapter: ServerGameAdapter = {
  ...acAdapter,

  runtime: {
    pit: {
      seedFuelFromHistory: true,
      seedTireWearFromHistory: false,
      useDistanceBasedWearCurves: false,
    },
    bestLapFromSession: true,
    requiresTrackCalibration: false,
    normSuspensionTravelMm: { min: 0, max: 50 },
  },

  processNames: ["acs.exe", "acs_x86.exe"],

  getCarName(ordinal: number): string {
    return getAcCarName(ordinal);
  },

  getTrackName(ordinal: number): string {
    return getAcTrackName(ordinal);
  },

  getSharedTrackName(ordinal: number): string | undefined {
    return getAcSharedTrackName(ordinal);
  },

  getTrackOrdinalByName(name: string): number | undefined {
    return getAcTrackByName(name)?.id;
  },

  // AC uses shared memory; only packed AC triplets reach the packet dispatch.
  canHandle(buf: Buffer): boolean {
    return buf.length > 4 && buf.readUInt32LE(0) === AC_PACKED_MAGIC;
  },

  tryParse(buf: Buffer, _state: unknown): TelemetryPacket | null {
    const triplet = unpackTriplet(buf);
    if (!triplet) return null;
    // Re-resolve identity from the embedded static page: discovered-car
    // ordinals are per-database, and the track catalog may have grown since
    // capture. Leaving CarOrdinal unset lets the lap detector register the car
    // folder in this database.
    const trackOrdinal = resolveAcIdentity(triplet.staticData).trackOrdinal;
    return parseAcBuffers(triplet.physics, triplet.graphics, triplet.staticData, {
      trackOrdinal: trackOrdinal >= 0 ? trackOrdinal : triplet.trackOrdinal,
    });
  },

  tryParseLapIndex(buf, _state): LapIndexPacket | null {
    const triplet = unpackTriplet(buf);
    return triplet
      ? parseAcLapIndex(triplet.physics, triplet.graphics, triplet.staticData, triplet.carOrdinal, triplet.trackOrdinal)
      : null;
  },

  primeParserState(_buf, _state): void {
    // AC frames are self-contained; no cross-frame decoder state exists.
  },

  createParserState(): null {
    return null;
  },

  createLapDetector: (opts) => new LapDetectorAc(opts),

  aiSystemPrompt: AC_SYSTEM_PROMPT,

  buildAiContext(packets: TelemetryPacket[]): string {
    return buildAcAiContext(packets);
  },
};
