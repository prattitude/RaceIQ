import type { LapDetectorOptions } from "@raceiq/backend-core/lap-detection/types";
import { KunosLapDetector } from "@raceiq/backend-core/games/kunos/lap-detector";

export const LAP_DETECTOR_AC_ID = "ac_lapdetector_v1";

/** Original AC uses the shared Kunos lap lifecycle (no isValidLap channel). */
export class LapDetectorAc extends KunosLapDetector {
  constructor(opts: LapDetectorOptions) {
    super(opts, LAP_DETECTOR_AC_ID, "[AC Lap Detector]");
  }
}
