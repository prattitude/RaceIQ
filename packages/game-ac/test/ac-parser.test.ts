import { describe, expect, test } from "bun:test";
import { PHYSICS, GRAPHICS, STATIC } from "@raceiq/capture-formats/ac/structs";
import { parseAcBuffers } from "../src/parser";
import { acTireHealth } from "../src/utils";

function makePhysicsBuf(overrides: Record<string, number> = {}): Buffer {
  const buf = Buffer.alloc(PHYSICS.SIZE);
  buf.writeFloatLE(overrides.gas ?? 0.75, PHYSICS.gas.offset);
  buf.writeFloatLE(overrides.brake ?? 0.1, PHYSICS.brake.offset);
  buf.writeFloatLE(overrides.fuel ?? 40, PHYSICS.fuel.offset);
  buf.writeInt32LE(overrides.gear ?? 4, PHYSICS.gear.offset);
  buf.writeInt32LE(overrides.rpms ?? 6800, PHYSICS.rpms.offset);
  buf.writeFloatLE(overrides.steerAngle ?? 0.2, PHYSICS.steerAngle.offset);
  buf.writeFloatLE(overrides.speedKmh ?? 160, PHYSICS.speedKmh.offset);
  buf.writeFloatLE(overrides.heading ?? 1.2, PHYSICS.heading.offset);
  buf.writeFloatLE(overrides.brakeBias ?? 0.55, PHYSICS.brakeBias.offset);
  buf.writeFloatLE(overrides.tyreWearFL ?? 92, PHYSICS.tyreWearFL.offset);
  buf.writeFloatLE(90, PHYSICS.tyreWearFR.offset);
  buf.writeFloatLE(88, PHYSICS.tyreWearRL.offset);
  buf.writeFloatLE(87, PHYSICS.tyreWearRR.offset);
  buf.writeFloatLE(85, PHYSICS.tyreCoreFL.offset);
  buf.writeFloatLE(86, PHYSICS.tyreCoreFR.offset);
  buf.writeFloatLE(84, PHYSICS.tyreCoreRL.offset);
  buf.writeFloatLE(83, PHYSICS.tyreCoreRR.offset);
  buf.writeFloatLE(27.2, PHYSICS.tyrePressureFL.offset);
  buf.writeFloatLE(27.1, PHYSICS.tyrePressureFR.offset);
  buf.writeFloatLE(26.9, PHYSICS.tyrePressureRL.offset);
  buf.writeFloatLE(26.8, PHYSICS.tyrePressureRR.offset);
  return buf;
}

function makeGraphicsBuf(overrides: Record<string, number | string> = {}): Buffer {
  const buf = Buffer.alloc(GRAPHICS.SIZE);
  buf.writeInt32LE(Number(overrides.status ?? 2), GRAPHICS.status.offset);
  buf.writeInt32LE(Number(overrides.session ?? 0), GRAPHICS.session.offset);
  buf.writeInt32LE(Number(overrides.completedLaps ?? 2), GRAPHICS.completedLaps.offset);
  buf.writeInt32LE(Number(overrides.position ?? 1), GRAPHICS.position.offset);
  buf.writeInt32LE(Number(overrides.iCurrentTime ?? 55234), GRAPHICS.iCurrentTime.offset);
  buf.writeInt32LE(Number(overrides.iLastTime ?? 98123), GRAPHICS.iLastTime.offset);
  buf.writeInt32LE(Number(overrides.iBestTime ?? 97500), GRAPHICS.iBestTime.offset);
  buf.writeFloatLE(Number(overrides.carX ?? 12.5), GRAPHICS.carX.offset);
  buf.writeFloatLE(Number(overrides.carY ?? 0.2), GRAPHICS.carY.offset);
  buf.writeFloatLE(Number(overrides.carZ ?? -44.1), GRAPHICS.carZ.offset);
  const compound = String(overrides.compound ?? "Slicks");
  buf.write(compound, GRAPHICS.currentTyreCompound.offset, compound.length * 2, "utf16le");
  return buf;
}

function makeStaticBuf(overrides: { carModel?: string; track?: string; maxRpm?: number } = {}): Buffer {
  const buf = Buffer.alloc(STATIC.SIZE);
  const carModel = overrides.carModel ?? "ks_ferrari_488_gt3";
  const track = overrides.track ?? "ks_monza";
  buf.write(carModel, STATIC.carModel.offset, carModel.length * 2, "utf16le");
  buf.write(track, STATIC.track.offset, track.length * 2, "utf16le");
  buf.writeInt32LE(overrides.maxRpm ?? 7500, STATIC.maxRpm.offset);
  buf.writeFloatLE(120, STATIC.maxFuel.offset);
  buf.writeFloatLE(0.08, STATIC.suspMaxFL.offset);
  buf.writeFloatLE(0.08, STATIC.suspMaxFR.offset);
  buf.writeFloatLE(0.08, STATIC.suspMaxRL.offset);
  buf.writeFloatLE(0.08, STATIC.suspMaxRR.offset);
  return buf;
}

describe("acTireHealth", () => {
  test("maps percent-remaining wear to 0..1 health", () => {
    expect(acTireHealth(100)).toBeCloseTo(1);
    expect(acTireHealth(50)).toBeCloseTo(0.5);
    expect(acTireHealth(0.9)).toBeCloseTo(0.9);
  });
});

describe("parseAcBuffers", () => {
  test("rejects undersized buffers", () => {
    expect(parseAcBuffers(Buffer.alloc(10), Buffer.alloc(10), Buffer.alloc(10))).toBeNull();
    expect(
      parseAcBuffers(
        Buffer.alloc(PHYSICS.SIZE - 1),
        Buffer.alloc(GRAPHICS.SIZE),
        Buffer.alloc(STATIC.SIZE),
      ),
    ).toBeNull();
  });

  test("parses original AC pack(4) page sizes into a live packet", () => {
    const packet = parseAcBuffers(makePhysicsBuf(), makeGraphicsBuf(), makeStaticBuf(), {
      carOrdinal: 7,
      trackOrdinal: 3,
    });
    expect(packet).not.toBeNull();
    expect(packet!.gameId).toBe("ac");
    expect(packet!.IsRaceOn).toBe(1);
    expect(packet!.CurrentEngineRpm).toBe(6800);
    expect(packet!.EngineMaxRpm).toBe(7500);
    expect(packet!.Gear).toBe(3); // AC gear 4 (0=R,1=N,2=1st) → normalized 3
    expect(packet!.Speed).toBeCloseTo(160 / 3.6, 5);
    expect(packet!.CurrentLap).toBeCloseTo(55.234);
    expect(packet!.LastLap).toBeCloseTo(98.123);
    expect(packet!.BestLap).toBeCloseTo(97.5);
    expect(packet!.LapNumber).toBe(3);
    expect(packet!.CarOrdinal).toBe(7);
    expect(packet!.TrackOrdinal).toBe(3);
    expect(packet!.PositionX).toBeCloseTo(12.5);
    expect(packet!.PositionZ).toBeCloseTo(-44.1);
    expect(packet!.TireWearFL).toBeCloseTo(0.92);
    expect(packet!.acc?.sessionType).toBe("practice");
    expect(packet!.acc?.tireCompound).toBe("Slicks");
    expect(packet!.acc?.brakeBias).toBeCloseTo(0.55);
    // Original AC has no dedicated slip-ratio / slip-angle channels.
    expect(packet!.TireSlipRatioFL).toBe(0);
    expect(packet!.TireSlipAngleFL).toBe(0);
  });

  test("struct SIZE constants stay on original AC (not ACC) values", () => {
    expect(PHYSICS.SIZE).toBe(580);
    expect(GRAPHICS.SIZE).toBe(296);
    expect(STATIC.SIZE).toBe(684);
  });
});
