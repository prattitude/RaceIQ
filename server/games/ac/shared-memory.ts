/**
 * Original Assetto Corsa shared memory reader.
 *
 * AC publishes the same `Local\acpmf_*` mapping names as ACC; the native
 * source supervisor only constructs this reader while acs.exe is running.
 *
 *   BufferedKunosMemoryReader (300Hz physics, 60Hz graphics, static on change)
 *     → TripletAssembler (100Hz)
 *       → TripletPipeline: AcStatusCheckProcessor → AcParsingProcessor | DumpToBinProcessor
 */

import { BufferedKunosMemoryReader } from "../kunos/buffered-memory-reader";
import type { IRealtimeKunosMemoryReader } from "../kunos/memory-reader";
import { KunosRecorder } from "../kunos/recorder";
import { TripletAssembler } from "../kunos/triplet-assembler";
import { createKunosTripletPipeline, type TripletPipeline, type TripletProcessor } from "../kunos/triplet-pipeline";
import { acquireHighResolutionTimer, releaseHighResolutionTimer } from "../shared/win-timer-resolution";
import { resolveAcIdentity } from "./parser";
import { AcParsingProcessor, AcStatusCheckProcessor } from "./processors";
import { GRAPHICS, PHYSICS, STATIC } from "./structs";

export const acRecorder = new KunosRecorder();

export interface AcSharedMemoryReaderOptions {
  recordingEnabled?: boolean;
  memoryReader?: IRealtimeKunosMemoryReader;
  recorder?: KunosRecorder;
  recordingDir?: string;
  parser?: TripletProcessor;
  enableMetrics?: boolean;
}

export class AcSharedMemoryReader {
  private readonly _bufferedReader: IRealtimeKunosMemoryReader;
  private readonly _tripletAssembler: TripletAssembler;
  private _pipeline: TripletPipeline | null = null;
  private _running = false;
  private _connected = false;
  private readonly _recordingEnabled: boolean;
  private readonly _recorder: KunosRecorder;
  private readonly _recordingDir: string | undefined;
  private readonly _parser: TripletProcessor;
  private _holdsTimerResolution = false;

  constructor(options: boolean | AcSharedMemoryReaderOptions = false) {
    const config = typeof options === "boolean" ? { recordingEnabled: options } : options;
    this._recordingEnabled = config.recordingEnabled ?? false;
    this._bufferedReader = config.memoryReader ?? new BufferedKunosMemoryReader({
      physicsSize: PHYSICS.SIZE,
      graphicsSize: GRAPHICS.SIZE,
      staticSize: STATIC.SIZE,
      physicsName: "Local\\acpmf_physics",
      graphicsName: "Local\\acpmf_graphics",
      staticName: "Local\\acpmf_static",
      sessionIdOffset: null,
      staticValid: (buf) => resolveAcIdentity(buf).carModel !== "",
      logPrefix: "AC",
    });
    const enableMetrics = config.enableMetrics ??
      (process.env.NODE_ENV !== "production" || process.env.ACC_METRICS === "1");
    this._tripletAssembler = new TripletAssembler(this._bufferedReader, enableMetrics, "AC");
    this._recorder = config.recorder ?? acRecorder;
    this._recordingDir = config.recordingDir;
    this._parser = config.parser ?? new AcParsingProcessor();

    if (this._recordingEnabled) {
      const recordPath = this._recorder.start(this._recordingDir, "ac");
      console.log(`[AC] Recording mode: bin file created at ${recordPath}`);
    }
  }

  get connected(): boolean {
    return this._connected;
  }

  get running(): boolean {
    return this._running;
  }

  /** Read current raw buffers for debugging. Returns null if not connected. */
  getDebugBuffers(): { physics: Buffer; graphics: Buffer; staticData: Buffer } | null {
    return this._bufferedReader.getDebugBuffers();
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    console.log("[AC] Starting shared memory reader...");
    this._connect();
  }

  async stop(): Promise<void> {
    this._running = false;
    await this._tripletAssembler.stop();
    await this._bufferedReader.stop();
    this._connected = false;
    if (this._holdsTimerResolution) {
      this._holdsTimerResolution = false;
      releaseHighResolutionTimer();
    }
    if (this._recordingEnabled) await this._recorder.stop();
    console.log("[AC] Shared memory reader stopped");
  }

  private _connect(): void {
    if (this._connected) return;
    // Sub-tick capture intervals need a raised timer resolution on Windows;
    // see server/games/shared/win-timer-resolution.ts.
    if (!this._holdsTimerResolution) {
      acquireHighResolutionTimer();
      this._holdsTimerResolution = true;
    }
    this._bufferedReader.start();
    this._connected = true;
    this._pipeline = createKunosTripletPipeline({
      recordingEnabled: this._recordingEnabled,
      recorder: this._recorder,
      parser: this._parser,
      gate: new AcStatusCheckProcessor(),
    });
    this._tripletAssembler.start(this._pipeline.process.bind(this._pipeline));
    console.log("[AC] Connected - buffers reading and pipeline active");
  }
}
