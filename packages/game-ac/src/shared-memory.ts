/**
 * Assetto Corsa ORIGINAL shared-memory reader.
 * Same Local\\acpmf_* names as ACC, but original AC page sizes (580/296/684).
 */

import { BufferedKunosMemoryReader } from "@raceiq/backend-core/games/kunos/buffered-memory-reader";
import type { IRealtimeKunosMemoryReader } from "@raceiq/backend-core/games/kunos/memory-reader";
import { KunosRecorder } from "@raceiq/backend-core/games/kunos/recorder";
import { TripletAssembler } from "@raceiq/backend-core/games/kunos/triplet-assembler";
import {
  createKunosTripletPipeline,
  TripletPipeline,
  type TripletProcessor,
} from "@raceiq/backend-core/games/kunos/triplet-pipeline";
import { acquireHighResolutionTimer, releaseHighResolutionTimer } from "@raceiq/backend-core/games/shared/win-timer-resolution";
import { ParsingProcessor, StatusCheckProcessor } from "./processors";
import { GRAPHICS, PHYSICS, STATIC } from "@raceiq/capture-formats/ac/structs";

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
  private _bufferedReader: IRealtimeKunosMemoryReader;
  private _tripletAssembler: TripletAssembler;
  private _pipeline: TripletPipeline;
  private _running = false;
  private _connected = false;
  private _recordingEnabled = false;
  private readonly _recorder: KunosRecorder;
  private readonly _recordingDir: string | undefined;
  private readonly _parser: TripletProcessor;
  private _holdsTimerResolution = false;

  constructor(options: boolean | AcSharedMemoryReaderOptions = false) {
    const config = typeof options === "boolean" ? { recordingEnabled: options } : options;
    this._recordingEnabled = config.recordingEnabled ?? false;
    this._bufferedReader =
      config.memoryReader ??
      new BufferedKunosMemoryReader({
        physicsSize: PHYSICS.SIZE,
        graphicsSize: GRAPHICS.SIZE,
        staticSize: STATIC.SIZE,
        physicsName: "Local\\acpmf_physics",
        graphicsName: "Local\\acpmf_graphics",
        staticName: "Local\\acpmf_static",
        sessionIdOffset: 8,
        logPrefix: "AC",
      });
    const enableMetrics =
      config.enableMetrics ?? (process.env.NODE_ENV !== "production" || process.env.AC_METRICS === "1");
    this._tripletAssembler = new TripletAssembler(this._bufferedReader, enableMetrics, "AC");
    this._pipeline = new TripletPipeline();
    this._recorder = config.recorder ?? acRecorder;
    this._recordingDir = config.recordingDir;
    this._parser = config.parser ?? new ParsingProcessor();

    if (this._recordingEnabled) {
      const recordPath = this._recorder.start(this._recordingDir);
      console.log(`[AC] Recording mode: bin file created at ${recordPath}`);
    }
  }

  get connected(): boolean {
    return this._connected;
  }

  get running(): boolean {
    return this._running;
  }

  getDebugBuffers(): { physics: Buffer; graphics: Buffer; staticData: Buffer } | null {
    return this._bufferedReader.getDebugBuffers();
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    console.log("[AC] Starting shared memory reader...");
    this._onAcDetected();
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
    if (this._recordingEnabled) {
      await this._recorder.stop();
    }
    console.log("[AC] Shared memory reader stopped");
  }

  private _onAcDetected(): void {
    if (this._connected) return;
    console.log("[AC] AC process detected, starting buffered reader...");

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
      gate: new StatusCheckProcessor(),
    });
    console.log(
      this._recordingEnabled
        ? "[AC] Triplet pipeline: StatusCheckProcessor → DumpToBinProcessor"
        : "[AC] Triplet pipeline: StatusCheckProcessor → ParsingProcessor",
    );

    this._tripletAssembler.start(this._pipeline.process.bind(this._pipeline));
    console.log("[AC] Connected - buffers reading and pipeline active");
  }
}
