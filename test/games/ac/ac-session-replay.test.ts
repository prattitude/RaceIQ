/**
 * Original Assetto Corsa replay coverage from a real AC v1.7 capture:
 * KTM X-Bow R at Brands Hatch Indy, outlap + five timed laps, with a
 * deliberate cut on the final timed lap and an incomplete lap at the end.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { initGameAdapters } from "../../../shared/games/init";
import { initServerGameAdapters } from "../../../server/games/init";
import { CapturingDbAdapter } from "../../../server/telemetry/pipeline-ports";
import { stopMaintenanceTasks } from "../../../server/telemetry/live-pipeline";
import { readKunosFrames, type KunosFrame } from "../../../server/games/kunos/frame-reader";
import { parseAcBuffers, resolveAcIdentity } from "../../../server/games/ac/parser";
import { classifyAcTrackLimits, LapDetectorAc } from "../../../server/games/ac/lap-detector";
import { getAcTrackName } from "../../../shared/racing/tracks/catalogs/ac";
import { getAcCarName } from "../../../shared/racing/cars/ac";
import type { TelemetryPacket } from "../../../shared/telemetry/types";

initGameAdapters();
initServerGameAdapters();

afterAll(() => stopMaintenanceTasks());

const AC_FIXTURE = "test/artifacts/sessions/ac-2026-10-03T05-24-31-321Z.bin.gz";
const BRANDS_HATCH_INDY = 2;

let frames: KunosFrame[] = [];
beforeAll(() => {
  frames = readKunosFrames(AC_FIXTURE);
});

function packetsFor(trackOrdinal: number): TelemetryPacket[] {
  return frames.flatMap((frame) => {
    const packet = parseAcBuffers(frame.physics, frame.graphics, frame.staticData, { trackOrdinal });
    return packet ? [packet] : [];
  });
}

describe("AC parser — real capture", () => {
  test("resolves car folder and bundled track layout from static page", () => {
    expect(frames.length).toBeGreaterThan(0);
    const identity = resolveAcIdentity(frames[0]!.staticData);
    expect(identity.carModel).toBe("ktm_xbow_r");
    expect(identity.trackOrdinal).toBe(BRANDS_HATCH_INDY);
    expect(getAcTrackName(identity.trackOrdinal)).toBe("Brands Hatch - Indy");
  });

  test("surfaces raw car model while the car is unregistered", () => {
    const [packet] = packetsFor(BRANDS_HATCH_INDY);
    expect(packet).toMatchObject({ gameId: "ac", CarOrdinal: -1, carModelName: "ktm_xbow_r", TrackOrdinal: BRANDS_HATCH_INDY });
  });

  test("keeps native channels and marks absent ones with placeholders", () => {
    const packets = packetsFor(BRANDS_HATCH_INDY);
    const moving = packets.find((p) => p.Speed > 30)!;
    expect(moving).toBeDefined();
    expect(moving.CurrentEngineRpm).toBeGreaterThan(0);
    expect(moving.EngineMaxRpm).toBeGreaterThan(moving.CurrentEngineRpm * 0.5);
    expect(moving.acc!.tireMiddleTemp).toEqual([
      moving.TireSurfaceTempMiddleFL!, moving.TireSurfaceTempMiddleFR!,
      moving.TireSurfaceTempMiddleRL!, moving.TireSurfaceTempMiddleRR!,
    ]);
    expect(moving.TireCarcassTempFL).toBe(moving.acc!.tireCoreTemp[0]);
    expect(moving.AirTemp).toBe(moving.acc!.airTempC!);
    expect(moving.TrackTemp).toBe(moving.acc!.roadTempC!);
    expect(moving.acc!.isValidLap).toBeNull();
    expect(moving.acc!.brakePadWear).toEqual([-1, -1, -1, -1]);
    expect([moving.TireWearFL, moving.TireWearFR, moving.TireWearRL, moving.TireWearRR]).toEqual([-1, -1, -1, -1]);
    expect(moving.BrakeTempFrontLeft).toBe(0);
    expect(moving.TireSlipRatioFL).toBe(0);
    expect(moving.TireSlipAngleFL).toBe(0);
  });

  test("returns null for undersized pages", () => {
    const frame = frames[0]!;
    expect(parseAcBuffers(Buffer.alloc(10), frame.graphics, frame.staticData)).toBeNull();
    expect(resolveAcIdentity(Buffer.alloc(10))).toEqual({ carModel: "", trackOrdinal: -1 });
  });
});

describe("AC lap detection — real capture", () => {
  test("records outlap, four valid laps, the cut lap, and the incomplete tail", async () => {
    const db = new CapturingDbAdapter();
    const detector = new LapDetectorAc({ db });
    for (const packet of packetsFor(BRANDS_HATCH_INDY)) await detector.feed(packet);
    await detector.finalizeCurrentSession();

    expect(db.sessions).toHaveLength(1);
    expect(db.sessions[0]).toMatchObject({ gameId: "ac", trackOrdinal: BRANDS_HATCH_INDY, sessionType: "practice" });
    expect(db.sessions[0]!.carOrdinal).toBeGreaterThanOrEqual(100000);
    expect(getAcCarName(db.sessions[0]!.carOrdinal)).toBe("KTM Xbow R");

    expect(db.laps.map((lap) => [lap.lapNumber, lap.lapTime, lap.isValid, lap.invalidReason])).toEqual([
      [1, 73.54, false, "outlap"],
      [2, 56.057, true, null],
      [3, 55.285, true, null],
      [4, 54.694, true, null],
      [5, 53.879, true, null],
      [6, 53.967, false, "track limits"],
      [7, expect.any(Number), false, "incomplete"],
    ]);
  }, { timeout: 120_000 });
});

describe("classifyAcTrackLimits", () => {
  const frame = (tyresOut: number, pitStatus = "out") =>
    ({ acc: { numberOfTyresOut: tyresOut, pitStatus } }) as unknown as TelemetryPacket;

  test("flags more than two tyres out for two consecutive frames", () => {
    expect(classifyAcTrackLimits([frame(0), frame(3), frame(3), frame(0)])).toBe("track limits");
  });

  test("ignores single-frame blips, two tyres out, and pit lane", () => {
    expect(classifyAcTrackLimits([frame(3), frame(0), frame(4), frame(0)])).toBeNull();
    expect(classifyAcTrackLimits([frame(2), frame(2), frame(2)])).toBeNull();
    expect(classifyAcTrackLimits([frame(4, "pit_lane"), frame(4, "pit_lane")])).toBeNull();
  });
});
