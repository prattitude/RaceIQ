import type { ServerGameAdapter } from "@raceiq/backend-core/games/types";
import type { TelemetryPacket } from "@raceiq/shared/telemetry/types";
import type { LapIndexPacket } from "@raceiq/backend-core/lap-detection/types";
import { acAdapter } from "@raceiq/game-ac-metadata/index";
import { getAcCarName, getAcTrackName, getAcTrackOrdinalByName, rememberAcCar, rememberAcTrack } from "@raceiq/game-ac-metadata/identity";
import { LapDetectorAc } from "./lap-detector";
import { parseAcBuffers } from "./parser";
import { parseAcLapIndex } from "./lap-index";
import { STATIC } from "@raceiq/capture-formats/ac/structs";
import { readWString } from "./utils";
import { AC_PACKED_MAGIC, unpackTriplet } from "@raceiq/backend-core/games/kunos/pack-triplet";
import { renderAnalystSchemaForPrompt } from "@raceiq/backend-core/ai/schemas";
import { buildKunosAiContext } from "@raceiq/backend-core/games/kunos/ai-context";

const AC_SYSTEM_PROMPT = `You are an expert racing engineer analyzing Assetto Corsa (original) telemetry.

Your response MUST be valid JSON matching this exact schema. Output ONLY the JSON object, no markdown fences, no extra text.

${renderAnalystSchemaForPrompt()}

Focus on brake points, trail-braking, throttle pickup, and car balance. Reference concrete numbers from the data. Address the driver as "you". Output ONLY valid JSON.`;

export const acServerAdapter: ServerGameAdapter = {
  ...acAdapter,

  runtime: {
    pit: {
      seedFuelFromHistory: true,
      seedTireWearFromHistory: true,
      useDistanceBasedWearCurves: true,
    },
    bestLapFromSession: true,
    requiresTrackCalibration: false,
    normSuspensionTravelMm: { min: 0, max: 50 },
  },

  processNames: ["acs.exe"],

  getCarName(ordinal: number): string {
    return getAcCarName(ordinal);
  },

  getTrackName(ordinal: number): string {
    return getAcTrackName(ordinal);
  },

  getSharedTrackName(_ordinal: number): string | undefined {
    return undefined;
  },

  getTrackOrdinalByName(name: string): number | undefined {
    return getAcTrackOrdinalByName(name);
  },

  canHandle(buf: Buffer): boolean {
    return buf.length > 4 && buf.readUInt32LE(0) === AC_PACKED_MAGIC;
  },

  tryParse(buf: Buffer, _state: unknown): TelemetryPacket | null {
    const triplet = unpackTriplet(buf);
    if (!triplet) return null;

    let carOrdinal = triplet.carOrdinal;
    let trackOrdinal = triplet.trackOrdinal;
    if (triplet.staticData.length >= STATIC.SIZE) {
      const cm = readWString(triplet.staticData, STATIC.carModel.offset, STATIC.carModel.size);
      if (cm) carOrdinal = rememberAcCar(cm);
      const tn = readWString(triplet.staticData, STATIC.track.offset, STATIC.track.size);
      if (tn) trackOrdinal = rememberAcTrack(tn);
    }

    return parseAcBuffers(triplet.physics, triplet.graphics, triplet.staticData, {
      carOrdinal,
      trackOrdinal,
      gameId: "ac",
    });
  },

  tryParseLapIndex(buf, _state): LapIndexPacket | null {
    const triplet = unpackTriplet(buf);
    return triplet
      ? parseAcLapIndex(triplet.physics, triplet.graphics, triplet.staticData, triplet.carOrdinal, triplet.trackOrdinal)
      : null;
  },

  primeParserState(_buf, _state): void {},

  createParserState(): null {
    return null;
  },

  createLapDetector: (opts) => new LapDetectorAc(opts),

  aiSystemPrompt: AC_SYSTEM_PROMPT,

  buildAiContext(packets: TelemetryPacket[]): string {
    return buildKunosAiContext(packets, true);
  },
};
