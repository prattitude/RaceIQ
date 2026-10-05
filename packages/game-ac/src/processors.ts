import { rememberAcCar, rememberAcTrack } from "@raceiq/game-ac-metadata/identity";
import { processPacket } from "@raceiq/backend-core/telemetry/live-pipeline";
import { AC_PACKED_MAGIC, packTriplet } from "@raceiq/backend-core/games/kunos/pack-triplet";
import type { TripletProcessor } from "@raceiq/backend-core/games/kunos/triplet-pipeline";
import { parseAcBuffers } from "./parser";
import { AC_STATUS, GRAPHICS, STATIC } from "@raceiq/capture-formats/ac/structs";
import { readWString } from "./utils";

/** Gates triplet processing while original AC is outside a live or paused session. */
export class StatusCheckProcessor implements TripletProcessor {
  private loggedInvalidStatus = false;

  async process(triplet: { physics: Buffer; graphics: Buffer; staticData: Buffer }): Promise<boolean> {
    const status = triplet.graphics.readInt32LE(GRAPHICS.status.offset);
    if (status !== AC_STATUS.AC_LIVE && status !== AC_STATUS.AC_PAUSE) {
      if (!this.loggedInvalidStatus) {
        console.log(
          `[AC StatusCheck] Pausing pipeline, status=${status} (AC_OFF=${AC_STATUS.AC_OFF}, AC_REPLAY=${AC_STATUS.AC_REPLAY})`,
        );
        this.loggedInvalidStatus = true;
      }
      return false;
    }
    if (this.loggedInvalidStatus) {
      console.log(`[AC StatusCheck] Status=${status} — pipeline resuming`);
    }
    this.loggedInvalidStatus = false;
    return true;
  }
}

/** Parses original AC buffers and feeds normalized packets to the application pipeline. */
export class ParsingProcessor implements TripletProcessor {
  private carOrdinal: number;
  private trackOrdinal: number;

  constructor(carOrdinal = -1, trackOrdinal = -1) {
    this.carOrdinal = carOrdinal;
    this.trackOrdinal = trackOrdinal;
  }

  async process(triplet: {
    physics: Buffer;
    graphics: Buffer;
    staticData: Buffer;
    frameTimeMs?: number;
  }): Promise<undefined> {
    try {
      if (this.carOrdinal === -1 && triplet.staticData.length >= STATIC.SIZE) {
        const cm = readWString(triplet.staticData, STATIC.carModel.offset, STATIC.carModel.size);
        if (cm) this.carOrdinal = rememberAcCar(cm);
      }
      if (this.trackOrdinal === -1 && triplet.staticData.length >= STATIC.SIZE) {
        const tn = readWString(triplet.staticData, STATIC.track.offset, STATIC.track.size);
        if (tn) this.trackOrdinal = rememberAcTrack(tn);
      }
      const packet = parseAcBuffers(triplet.physics, triplet.graphics, triplet.staticData, {
        carOrdinal: this.carOrdinal,
        trackOrdinal: this.trackOrdinal,
        gameId: "ac",
      });
      if (packet) {
        const sourceFrame = packTriplet(
          AC_PACKED_MAGIC,
          this.carOrdinal,
          this.trackOrdinal,
          triplet.physics,
          triplet.graphics,
          triplet.staticData,
        );
        await processPacket(packet, sourceFrame, triplet.frameTimeMs);
      }
    } catch (err) {
      console.error("[AC ParsingProcessor] Error:", err instanceof Error ? err.message : err);
      throw err;
    }
    return undefined;
  }
}
