import type { LapIndexPacket } from "@raceiq/backend-core/lap-detection/types";
import { PHYSICS, GRAPHICS, STATIC } from "@raceiq/capture-formats/ac/structs";
import { rememberAcCar, rememberAcTrack } from "@raceiq/game-ac-metadata/identity";
import { acTireHealth, readWString } from "./utils";

/** Direct detector projection for packed original-AC frames. */
export function parseAcLapIndex(
  physics: Buffer,
  graphics: Buffer,
  stat: Buffer,
  carOrdinal: number,
  trackOrdinal: number,
): LapIndexPacket | null {
  if (physics.length < PHYSICS.SIZE || graphics.length < GRAPHICS.SIZE || stat.length < STATIC.SIZE) {
    return null;
  }
  const cm = readWString(stat, STATIC.carModel.offset, STATIC.carModel.size);
  const tn = readWString(stat, STATIC.track.offset, STATIC.track.size);
  if (cm) carOrdinal = rememberAcCar(cm);
  if (tn) trackOrdinal = rememberAcTrack(tn);
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
    TrackOrdinal: trackOrdinal,
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
    TireWearFL: acTireHealth(f(PHYSICS.tyreWearFL.offset)),
    TireWearFR: acTireHealth(f(PHYSICS.tyreWearFR.offset)),
    TireWearRL: acTireHealth(f(PHYSICS.tyreWearRL.offset)),
    TireWearRR: acTireHealth(f(PHYSICS.tyreWearRR.offset)),
    RacePosition: i(GRAPHICS.position.offset),
    WheelOnRumbleStripFL: 0,
    WheelOnRumbleStripFR: 0,
    WheelOnRumbleStripRL: 0,
    WheelOnRumbleStripRR: 0,
    acc: {
      pitStatus: i(GRAPHICS.isInPit.offset)
        ? "in_pit"
        : i(GRAPHICS.isInPitLane.offset)
          ? "pit_lane"
          : "out",
      currentSectorIndex: i(GRAPHICS.currentSectorIndex.offset),
      lastSectorTime: i(GRAPHICS.lastSectorTime.offset),
      isValidLap: null,
    } as never,
  };
}
