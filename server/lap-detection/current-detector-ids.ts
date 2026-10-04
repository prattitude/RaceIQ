import { LAP_DETECTOR_AC_ID } from "../games/ac/lap-detector";
import { LAP_DETECTOR_ACC_ID } from "../games/acc/lap-detector";
import { LAP_DETECTOR_AC_EVO_ID } from "../games/ac-evo/lap-detector";
import { LAP_DETECTOR_IRACING_ID } from "../games/iracing/lap-detector";
import { LAP_DETECTOR_ID } from "./detector";

/** Detector ids that current recordings already use. A session is stale only when its stored id is missing from this list. */
export const CURRENT_LAP_DETECTOR_IDS = [
  LAP_DETECTOR_ID,
  LAP_DETECTOR_ACC_ID,
  LAP_DETECTOR_AC_EVO_ID,
  LAP_DETECTOR_AC_ID,
  LAP_DETECTOR_IRACING_ID,
] as const;
