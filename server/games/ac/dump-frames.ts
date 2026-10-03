import { readKunosFramesFromBuffer } from "../kunos/frame-reader";
import { AC_PACKED_MAGIC, packTriplet } from "../kunos/pack-triplet";

/**
 * Convert an AC ACCTEST dump (written by the AC recorder or the capture
 * script) into packed AC source frames the server adapter's tryParse accepts.
 * Identity is left unresolved so the importing database registers the car.
 */
export function* acSourceFramesFromDump(data: Buffer): Generator<Buffer> {
  for (const frame of readKunosFramesFromBuffer(data)) {
    yield packTriplet(AC_PACKED_MAGIC, -1, -1, frame.physics, frame.graphics, frame.staticData);
  }
}
