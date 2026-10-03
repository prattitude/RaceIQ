import type { AcSharedMemoryReader } from "../games/ac/shared-memory";
import type { AccSharedMemoryReader } from "../games/acc/shared-memory";
import type { AcEvoSharedMemoryReader } from "../games/ac-evo/shared-memory";
import type { IRacingTelemetrySource } from "../games/iracing/source";
import type { LMUTelemetrySource } from "../games/lmu/source";

let accReader: AccSharedMemoryReader | null = null;
let acEvoReader: AcEvoSharedMemoryReader | null = null;
let acReader: AcSharedMemoryReader | null = null;
let iracingSource: IRacingTelemetrySource | null = null;
let lmuSource: LMUTelemetrySource | null = null;

export function setAccReader(reader: AccSharedMemoryReader | null): void {
  accReader = reader;
}

export function setAcEvoReader(reader: AcEvoSharedMemoryReader | null): void {
  acEvoReader = reader;
}

export function setAcReader(reader: AcSharedMemoryReader | null): void {
  acReader = reader;
}

export function setIracingSource(reader: IRacingTelemetrySource | null): void {
  iracingSource = reader;
}
export function setLmuSource(source: LMUTelemetrySource | null): void {
  lmuSource = source;
}


export function getAccReader(): AccSharedMemoryReader | null {
  return accReader;
}

export function getAcEvoReader(): AcEvoSharedMemoryReader | null {
  return acEvoReader;
}

export function getAcReader(): AcSharedMemoryReader | null {
  return acReader;
}

export function getIracingSource(): IRacingTelemetrySource | null {
  return iracingSource;
}

export function getLmuSource(): LMUTelemetrySource | null {
  return lmuSource;
}

