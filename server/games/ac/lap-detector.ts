import type { TelemetryPacket } from "../../../shared/telemetry/types";
import { injectDiscoveredAcCars } from "../../../shared/racing/cars/ac";
import { getOrCreateDiscoveredCar } from "../../db/discovered-cars";
import type { LapDetectorOptions } from "../../lap-detection/types";
import { KunosLapDetector } from "../kunos/lap-detector";

export const LAP_DETECTOR_AC_ID = "ac_lapdetector_v1";

/** More than two tyres off the surface is AC's cut condition. */
const TYRES_OUT_CUT_THRESHOLD = 2;
/** Consecutive cut frames required, so a single-frame kerb blip is not a cut. */
const TRACK_LIMITS_MIN_FRAMES = 2;

/**
 * Classify a track-limits cut from AC's native numberOfTyresOut count.
 * AC publishes no lap-validity flag, so this is a RaceIQ-derived rule over
 * the native channel rather than a game-reported invalidation.
 */
export function classifyAcTrackLimits(packets: readonly TelemetryPacket[]): "track limits" | null {
  let run = 0;
  for (const packet of packets) {
    const pit = packet.acc?.pitStatus;
    if ((packet.acc?.numberOfTyresOut ?? 0) > TYRES_OUT_CUT_THRESHOLD && pit === "out") {
      run += 1;
      if (run >= TRACK_LIMITS_MIN_FRAMES) return "track limits";
    } else {
      run = 0;
    }
  }
  return null;
}

/** Original AC policy hooks for the shared Kunos lap lifecycle. */
export class LapDetectorAc extends KunosLapDetector {
  constructor(opts: LapDetectorOptions) {
    super(opts, LAP_DETECTOR_AC_ID, "[AC Lap Detector]");
  }

  /** AC has no bundled car roster; register each content folder in discovered_cars. */
  protected resolveCarOrdinal(packet: TelemetryPacket): number | Promise<number> {
    if (packet.CarOrdinal >= 0 || !packet.carModelName || packet.gameId !== "ac") {
      return packet.CarOrdinal;
    }
    const model = packet.carModelName;
    return getOrCreateDiscoveredCar("ac", model, model).then((ordinal) => {
      injectDiscoveredAcCars([{ ordinal, name: model }]);
      return ordinal;
    });
  }

  protected classifyTrackLimits(packets: TelemetryPacket[]): "track limits" | null {
    return classifyAcTrackLimits(packets);
  }
}
