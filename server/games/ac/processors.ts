import { injectDiscoveredAcCars } from "../../../shared/racing/cars/ac";
import { getOrCreateDiscoveredCar } from "../../db/discovered-cars";
import { processPacket } from "../../telemetry/live-pipeline";
import { AC_PACKED_MAGIC, packTriplet } from "../kunos/pack-triplet";
import type { Triplet, TripletProcessor } from "../kunos/triplet-pipeline";
import { parseAcBuffers, resolveAcIdentity } from "./parser";
import { AC_STATUS, GRAPHICS } from "./structs";

/** Gates triplet processing while AC is outside a live or paused session. */
export class AcStatusCheckProcessor implements TripletProcessor {
  private loggedInvalidStatus = false;

  async process(triplet: Triplet): Promise<boolean> {
    const status = triplet.graphics.readInt32LE(GRAPHICS.status.offset);
    if (status !== AC_STATUS.AC_LIVE && status !== AC_STATUS.AC_PAUSE) {
      if (!this.loggedInvalidStatus) {
        console.log(`[AC StatusCheck] Pausing pipeline, status=${status}`);
        this.loggedInvalidStatus = true;
      }
      return false;
    }
    if (this.loggedInvalidStatus) console.log(`[AC StatusCheck] Status=${status} — pipeline resuming`);
    this.loggedInvalidStatus = false;
    return true;
  }
}

/** Parses AC pages, resolves identity once per car/track, and feeds the live pipeline. */
export class AcParsingProcessor implements TripletProcessor {
  private carModel = "";
  private carOrdinal = -1;
  private trackOrdinal = -1;

  async process(triplet: Triplet): Promise<undefined> {
    try {
      const identity = resolveAcIdentity(triplet.staticData);
      if (identity.carModel && identity.carModel !== this.carModel) {
        const model = identity.carModel;
        this.carOrdinal = await getOrCreateDiscoveredCar("ac", model, model);
        injectDiscoveredAcCars([{ ordinal: this.carOrdinal, name: model }]);
        this.carModel = model;
      }
      this.trackOrdinal = identity.trackOrdinal;
      const packet = parseAcBuffers(triplet.physics, triplet.graphics, triplet.staticData, {
        carOrdinal: this.carOrdinal,
        trackOrdinal: this.trackOrdinal,
      });
      if (packet) {
        const sourceFrame = packTriplet(AC_PACKED_MAGIC, this.carOrdinal, this.trackOrdinal, triplet.physics, triplet.graphics, triplet.staticData);
        await processPacket(packet, sourceFrame, triplet.frameTimeMs);
      }
    } catch (err) {
      console.error("[AC ParsingProcessor] Error:", err instanceof Error ? err.message : err);
      throw err;
    }
    return undefined;
  }
}
