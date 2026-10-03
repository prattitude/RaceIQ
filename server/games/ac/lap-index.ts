import type { LapIndexPacket } from "../../lap-detection/types";
import { GRAPHICS, PHYSICS, SESSION_TYPE_NAMES, STATIC } from "./structs";
import { resolveAcIdentity } from "./parser";

/** Direct detector projection for packed AC frames. No TelemetryPacket allocation. */
export function parseAcLapIndex(physics: Buffer, graphics: Buffer, stat: Buffer, carOrdinal: number, trackOrdinal: number): LapIndexPacket | null {
  if (physics.length < PHYSICS.SIZE || graphics.length < GRAPHICS.SIZE || stat.length < STATIC.SIZE) return null;
  const identity = resolveAcIdentity(stat);
  const resolvedTrack = identity.trackOrdinal;
  const i = (o: number) => graphics.readInt32LE(o);
  const f = (o: number) => physics.readFloatLE(o);
  const current = i(GRAPHICS.iCurrentTime.offset);
  const last = i(GRAPHICS.iLastTime.offset);
  const best = i(GRAPHICS.iBestTime.offset);
  return {
    gameId: "ac",
    IsRaceOn: i(GRAPHICS.status.offset) === 2 ? 1 : 0,
    TimestampMS: Date.now(),
    CarOrdinal: carOrdinal,
    ...(carOrdinal < 0 && identity.carModel ? { carModelName: identity.carModel } : {}),
    TrackOrdinal: resolvedTrack >= 0 ? resolvedTrack : trackOrdinal,
    CarPerformanceIndex: 0,
    CarClass: 0,
    LapNumber: i(GRAPHICS.completedLaps.offset) + 1,
    CurrentLap: current > 0 && current !== 0x7fffffff ? current / 1000 : 0,
    LastLap: last > 0 && last !== 0x7fffffff ? last / 1000 : 0,
    BestLap: best > 0 && best !== 0x7fffffff ? best / 1000 : 0,
    DistanceTraveled: graphics.readFloatLE(GRAPHICS.distanceTraveled.offset),
    PositionX: graphics.readFloatLE(GRAPHICS.carX.offset),
    PositionZ: graphics.readFloatLE(GRAPHICS.carZ.offset),
    Yaw: f(PHYSICS.heading.offset),
    Fuel: f(PHYSICS.fuel.offset),
    TireWearFL: -1,
    TireWearFR: -1,
    TireWearRL: -1,
    TireWearRR: -1,
    RacePosition: i(GRAPHICS.position.offset),
    WheelOnRumbleStripFL: 0,
    WheelOnRumbleStripFR: 0,
    WheelOnRumbleStripRL: 0,
    WheelOnRumbleStripRR: 0,
    acc: {
      sessionType: SESSION_TYPE_NAMES[i(GRAPHICS.session.offset)] ?? "unknown",
      pitStatus: i(GRAPHICS.isInPit.offset) ? "in_pit" : i(GRAPHICS.isInPitLane.offset) ? "pit_lane" : "out",
      currentSectorIndex: i(GRAPHICS.currentSectorIndex.offset),
      lastSectorTime: i(GRAPHICS.lastSectorTime.offset),
      isValidLap: null,
      numberOfTyresOut: physics.readInt32LE(PHYSICS.numberOfTyresOut.offset),
    } as never,
  };
}
