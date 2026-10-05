/**
 * Assetto Corsa ORIGINAL parser: shared-memory buffers → TelemetryPacket.
 * Struct sizes differ from ACC — see @raceiq/capture-formats/ac/structs.
 */

import type { TelemetryPacket } from "@raceiq/shared/telemetry/types";
import type { KunosExtendedData } from "@raceiq/shared/telemetry/kunos";
import type { GameId } from "@raceiq/shared/games/ids";
import { PHYSICS, GRAPHICS, STATIC, FLAG_STATUS } from "@raceiq/capture-formats/ac/structs";
import { acTireHealth, readWString } from "./utils";

const SESSION_TYPE_NAMES: Record<number, string> = {
  [-1]: "unknown",
  0: "practice",
  1: "qualifying",
  2: "race",
  3: "hotlap",
  4: "time-attack",
  5: "drift",
  6: "drag",
};

export function parseAcBuffers(
  physicsBuf: Buffer,
  graphicsBuf: Buffer,
  staticBuf: Buffer,
  overrides?: { carOrdinal?: number; trackOrdinal?: number; gameId?: GameId },
): TelemetryPacket | null {
  if (
    physicsBuf.length < PHYSICS.SIZE ||
    graphicsBuf.length < GRAPHICS.SIZE ||
    staticBuf.length < STATIC.SIZE
  ) {
    return null;
  }

  const gas = physicsBuf.readFloatLE(PHYSICS.gas.offset);
  const brake = physicsBuf.readFloatLE(PHYSICS.brake.offset);
  const fuel = physicsBuf.readFloatLE(PHYSICS.fuel.offset);
  const acGear = physicsBuf.readInt32LE(PHYSICS.gear.offset);
  const rpms = physicsBuf.readInt32LE(PHYSICS.rpms.offset);
  const steerAngle = physicsBuf.readFloatLE(PHYSICS.steerAngle.offset);
  const speedKmh = physicsBuf.readFloatLE(PHYSICS.speedKmh.offset);

  const velX = physicsBuf.readFloatLE(PHYSICS.velocityX.offset);
  const velY = physicsBuf.readFloatLE(PHYSICS.velocityY.offset);
  const velZ = physicsBuf.readFloatLE(PHYSICS.velocityZ.offset);
  const angVelX = physicsBuf.readFloatLE(PHYSICS.localAngularVelX.offset);
  const angVelY = physicsBuf.readFloatLE(PHYSICS.localAngularVelY.offset);
  const angVelZ = physicsBuf.readFloatLE(PHYSICS.localAngularVelZ.offset);
  const gX = physicsBuf.readFloatLE(PHYSICS.accGX.offset);
  const gY = physicsBuf.readFloatLE(PHYSICS.accGY.offset);
  const gZ = physicsBuf.readFloatLE(PHYSICS.accGZ.offset);

  const heading = physicsBuf.readFloatLE(PHYSICS.heading.offset);
  const pitch = physicsBuf.readFloatLE(PHYSICS.pitch.offset);
  const roll = physicsBuf.readFloatLE(PHYSICS.roll.offset);

  const pressFL = physicsBuf.readFloatLE(PHYSICS.tyrePressureFL.offset);
  const pressFR = physicsBuf.readFloatLE(PHYSICS.tyrePressureFR.offset);
  const pressRL = physicsBuf.readFloatLE(PHYSICS.tyrePressureRL.offset);
  const pressRR = physicsBuf.readFloatLE(PHYSICS.tyrePressureRR.offset);

  const coreFL = physicsBuf.readFloatLE(PHYSICS.tyreCoreFL.offset);
  const coreFR = physicsBuf.readFloatLE(PHYSICS.tyreCoreFR.offset);
  const coreRL = physicsBuf.readFloatLE(PHYSICS.tyreCoreRL.offset);
  const coreRR = physicsBuf.readFloatLE(PHYSICS.tyreCoreRR.offset);

  const innerFL = physicsBuf.readFloatLE(PHYSICS.tyreTempInnerFL.offset);
  const innerFR = physicsBuf.readFloatLE(PHYSICS.tyreTempInnerFR.offset);
  const innerRL = physicsBuf.readFloatLE(PHYSICS.tyreTempInnerRL.offset);
  const innerRR = physicsBuf.readFloatLE(PHYSICS.tyreTempInnerRR.offset);
  const middleFL = physicsBuf.readFloatLE(PHYSICS.tyreTempMiddleFL.offset);
  const middleFR = physicsBuf.readFloatLE(PHYSICS.tyreTempMiddleFR.offset);
  const middleRL = physicsBuf.readFloatLE(PHYSICS.tyreTempMiddleRL.offset);
  const middleRR = physicsBuf.readFloatLE(PHYSICS.tyreTempMiddleRR.offset);
  const outerFL = physicsBuf.readFloatLE(PHYSICS.tyreTempOuterFL.offset);
  const outerFR = physicsBuf.readFloatLE(PHYSICS.tyreTempOuterFR.offset);
  const outerRL = physicsBuf.readFloatLE(PHYSICS.tyreTempOuterRL.offset);
  const outerRR = physicsBuf.readFloatLE(PHYSICS.tyreTempOuterRR.offset);

  const camberFL = physicsBuf.readFloatLE(PHYSICS.camberFL.offset);
  const camberFR = physicsBuf.readFloatLE(PHYSICS.camberFR.offset);
  const camberRL = physicsBuf.readFloatLE(PHYSICS.camberRL.offset);
  const camberRR = physicsBuf.readFloatLE(PHYSICS.camberRR.offset);

  const loadFL = physicsBuf.readFloatLE(PHYSICS.wheelLoadFL.offset);
  const loadFR = physicsBuf.readFloatLE(PHYSICS.wheelLoadFR.offset);
  const loadRL = physicsBuf.readFloatLE(PHYSICS.wheelLoadRL.offset);
  const loadRR = physicsBuf.readFloatLE(PHYSICS.wheelLoadRR.offset);

  const rideHeightF = physicsBuf.readFloatLE(PHYSICS.rideHeightF.offset);
  const rideHeightR = physicsBuf.readFloatLE(PHYSICS.rideHeightR.offset);
  const cgHeight = physicsBuf.readFloatLE(PHYSICS.cgHeight.offset);
  const airTempC = physicsBuf.readFloatLE(PHYSICS.airTemp.offset);
  const roadTempC = physicsBuf.readFloatLE(PHYSICS.roadTemp.offset);

  const chBase = PHYSICS.contactHeadingBase.offset;
  const contactHeading: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ] = [
    [physicsBuf.readFloatLE(chBase), physicsBuf.readFloatLE(chBase + 4), physicsBuf.readFloatLE(chBase + 8)],
    [physicsBuf.readFloatLE(chBase + 12), physicsBuf.readFloatLE(chBase + 16), physicsBuf.readFloatLE(chBase + 20)],
    [physicsBuf.readFloatLE(chBase + 24), physicsBuf.readFloatLE(chBase + 28), physicsBuf.readFloatLE(chBase + 32)],
    [physicsBuf.readFloatLE(chBase + 36), physicsBuf.readFloatLE(chBase + 40), physicsBuf.readFloatLE(chBase + 44)],
  ];

  const brTempFL = physicsBuf.readFloatLE(PHYSICS.brakeTempFL.offset);
  const brTempFR = physicsBuf.readFloatLE(PHYSICS.brakeTempFR.offset);
  const brTempRL = physicsBuf.readFloatLE(PHYSICS.brakeTempRL.offset);
  const brTempRR = physicsBuf.readFloatLE(PHYSICS.brakeTempRR.offset);
  const clutch = physicsBuf.readFloatLE(PHYSICS.clutch.offset);

  const suspFL = physicsBuf.readFloatLE(PHYSICS.suspTravelFL.offset);
  const suspFR = physicsBuf.readFloatLE(PHYSICS.suspTravelFR.offset);
  const suspRL = physicsBuf.readFloatLE(PHYSICS.suspTravelRL.offset);
  const suspRR = physicsBuf.readFloatLE(PHYSICS.suspTravelRR.offset);

  const combinedSlipFL = physicsBuf.readFloatLE(PHYSICS.wheelSlipFL.offset);
  const combinedSlipFR = physicsBuf.readFloatLE(PHYSICS.wheelSlipFR.offset);
  const combinedSlipRL = physicsBuf.readFloatLE(PHYSICS.wheelSlipRL.offset);
  const combinedSlipRR = physicsBuf.readFloatLE(PHYSICS.wheelSlipRR.offset);
  const rotFL = physicsBuf.readFloatLE(PHYSICS.wheelRotFL.offset);
  const rotFR = physicsBuf.readFloatLE(PHYSICS.wheelRotFR.offset);
  const rotRL = physicsBuf.readFloatLE(PHYSICS.wheelRotRL.offset);
  const rotRR = physicsBuf.readFloatLE(PHYSICS.wheelRotRR.offset);

  const wearFL = acTireHealth(physicsBuf.readFloatLE(PHYSICS.tyreWearFL.offset));
  const wearFR = acTireHealth(physicsBuf.readFloatLE(PHYSICS.tyreWearFR.offset));
  const wearRL = acTireHealth(physicsBuf.readFloatLE(PHYSICS.tyreWearRL.offset));
  const wearRR = acTireHealth(physicsBuf.readFloatLE(PHYSICS.tyreWearRR.offset));

  const damFront = physicsBuf.readFloatLE(PHYSICS.damFront.offset);
  const damRear = physicsBuf.readFloatLE(PHYSICS.damRear.offset);
  const damLeft = physicsBuf.readFloatLE(PHYSICS.damLeft.offset);
  const damRight = physicsBuf.readFloatLE(PHYSICS.damRight.offset);
  const damCentre = physicsBuf.readFloatLE(PHYSICS.damCentre.offset);

  const tcFloat = physicsBuf.readFloatLE(PHYSICS.tc.offset);
  const absFloat = physicsBuf.readFloatLE(PHYSICS.abs.offset);
  const brakeBias = physicsBuf.readFloatLE(PHYSICS.brakeBias.offset);

  const status = graphicsBuf.readInt32LE(GRAPHICS.status.offset);
  const completedLaps = graphicsBuf.readInt32LE(GRAPHICS.completedLaps.offset);
  const position = graphicsBuf.readInt32LE(GRAPHICS.position.offset);
  const iCurrentTime = graphicsBuf.readInt32LE(GRAPHICS.iCurrentTime.offset);
  const iLastTime = graphicsBuf.readInt32LE(GRAPHICS.iLastTime.offset);
  const iBestTime = graphicsBuf.readInt32LE(GRAPHICS.iBestTime.offset);
  const distanceTraveled = graphicsBuf.readFloatLE(GRAPHICS.distanceTraveled.offset);
  const isInPit = graphicsBuf.readInt32LE(GRAPHICS.isInPit.offset);
  const isInPitLane = graphicsBuf.readInt32LE(GRAPHICS.isInPitLane.offset);
  const currentSectorIndex = graphicsBuf.readInt32LE(GRAPHICS.currentSectorIndex.offset);
  const lastSectorTime = graphicsBuf.readInt32LE(GRAPHICS.lastSectorTime.offset);
  const flag = graphicsBuf.readInt32LE(GRAPHICS.flag.offset);
  const windSpeed = graphicsBuf.readFloatLE(GRAPHICS.windSpeed.offset);
  const windDirection = graphicsBuf.readFloatLE(GRAPHICS.windDirection.offset);
  const penaltyTime = graphicsBuf.readFloatLE(GRAPHICS.penaltyTime.offset);
  const carX = graphicsBuf.readFloatLE(GRAPHICS.carX.offset);
  const carY = graphicsBuf.readFloatLE(GRAPHICS.carY.offset);
  const carZ = graphicsBuf.readFloatLE(GRAPHICS.carZ.offset);
  const tireCompound = readWString(
    graphicsBuf,
    GRAPHICS.currentTyreCompound.offset,
    GRAPHICS.currentTyreCompound.size,
  );

  const maxRpm = staticBuf.readInt32LE(STATIC.maxRpm.offset);
  const maxFuel = staticBuf.readFloatLE(STATIC.maxFuel.offset);
  const suspMaxFL = staticBuf.readFloatLE(STATIC.suspMaxFL.offset);
  const suspMaxFR = staticBuf.readFloatLE(STATIC.suspMaxFR.offset);
  const suspMaxRL = staticBuf.readFloatLE(STATIC.suspMaxRL.offset);
  const suspMaxRR = staticBuf.readFloatLE(STATIC.suspMaxRR.offset);
  const tyreRadFL = staticBuf.readFloatLE(STATIC.tyreRadiusFL.offset);
  const tyreRadFR = staticBuf.readFloatLE(STATIC.tyreRadiusFR.offset);
  const tyreRadRL = staticBuf.readFloatLE(STATIC.tyreRadiusRL.offset);
  const tyreRadRR = staticBuf.readFloatLE(STATIC.tyreRadiusRR.offset);

  const gear = acGear <= 1 ? 0 : acGear - 1;
  const accel = Math.round(gas * 255);
  const brakeVal = Math.round(brake * 255);
  const steer = Math.round(steerAngle * 127);
  const speed = speedKmh / 3.6;
  const INV = 0x7fffffff;
  const currentLap = iCurrentTime > 0 && iCurrentTime !== INV ? iCurrentTime / 1000 : 0;
  const lastLap = iLastTime > 0 && iLastTime !== INV ? iLastTime / 1000 : 0;
  const bestLap = iBestTime > 0 && iBestTime !== INV ? iBestTime / 1000 : 0;

  let pitStatus = "out";
  if (isInPit) pitStatus = "in_pit";
  else if (isInPitLane) pitStatus = "pit_lane";

  const session = graphicsBuf.readInt32LE(GRAPHICS.session.offset);
  const acc: KunosExtendedData = {
    sessionType: SESSION_TYPE_NAMES[session] ?? "unknown",
    penalty: 0,
    penaltyType: "none",
    penaltyTime,
    tireCompound: tireCompound || "dry_compound",
    tireCoreTemp: [coreFL, coreFR, coreRL, coreRR],
    tireInnerTemp: [innerFL, innerFR, innerRL, innerRR],
    tireMiddleTemp: [middleFL, middleFR, middleRL, middleRR],
    tireOuterTemp: [outerFL, outerFR, outerRL, outerRR],
    tireCamber: [camberFL, camberFR, camberRL, camberRR],
    wheelLoad: [loadFL, loadFR, loadRL, loadRR],
    rideHeight: [rideHeightF, rideHeightR],
    cgHeight,
    tireRadius: [tyreRadFL, tyreRadFR, tyreRadRL, tyreRadRR],
    tireContactHeading: contactHeading,
    brakePadCompound: 0,
    brakePadWear: [-1, -1, -1, -1],
    tc: 0,
    tcCut: 0,
    abs: 0,
    engineMap: 0,
    brakeBias,
    tcIntervention: tcFloat > 0.01 ? 1 : 0,
    absIntervention: absFloat > 0.01 ? 1 : 0,
    tcRaw: tcFloat,
    absRaw: absFloat,
    slipVibrations: 0,
    absVibrations: 0,
    rainIntensity: 0,
    trackGripStatus: "unknown",
    windSpeed,
    windDirection,
    airTempC,
    roadTempC,
    flagStatus: FLAG_STATUS[flag] ?? "none",
    drsAvailable: false,
    drsEnabled: false,
    pitStatus,
    isValidLap: null,
    fuelPerLap: 0,
    currentSectorIndex,
    lastSectorTime,
    carDamage: {
      front: damFront,
      rear: damRear,
      left: damLeft,
      right: damRight,
      centre: damCentre,
    },
  };

  const packet: TelemetryPacket = {
    gameId: overrides?.gameId ?? "ac",
    acc,
    IsRaceOn: status === 2 ? 1 : 0,
    TimestampMS: Date.now(),
    EngineMaxRpm: maxRpm,
    EngineIdleRpm: 0,
    CurrentEngineRpm: rpms,
    AccelerationX: gX * 9.81,
    AccelerationY: gY * 9.81,
    AccelerationZ: gZ * 9.81,
    VelocityX: velX,
    VelocityY: velY,
    VelocityZ: velZ,
    AngularVelocityX: angVelX,
    AngularVelocityY: angVelY,
    AngularVelocityZ: angVelZ,
    Yaw: heading,
    Pitch: pitch,
    Roll: roll,
    NormSuspensionTravelFL: suspMaxFL > 0 ? suspFL / suspMaxFL : 0,
    NormSuspensionTravelFR: suspMaxFR > 0 ? suspFR / suspMaxFR : 0,
    NormSuspensionTravelRL: suspMaxRL > 0 ? suspRL / suspMaxRL : 0,
    NormSuspensionTravelRR: suspMaxRR > 0 ? suspRR / suspMaxRR : 0,
    TireSlipRatioFL: 0,
    TireSlipRatioFR: 0,
    TireSlipRatioRL: 0,
    TireSlipRatioRR: 0,
    WheelRotationSpeedFL: rotFL,
    WheelRotationSpeedFR: rotFR,
    WheelRotationSpeedRL: rotRL,
    WheelRotationSpeedRR: rotRR,
    WheelOnRumbleStripFL: 0,
    WheelOnRumbleStripFR: 0,
    WheelOnRumbleStripRL: 0,
    WheelOnRumbleStripRR: 0,
    WheelInPuddleDepthFL: 0,
    WheelInPuddleDepthFR: 0,
    WheelInPuddleDepthRL: 0,
    WheelInPuddleDepthRR: 0,
    SurfaceRumbleFL_2: 0,
    SurfaceRumbleFR_2: 0,
    SurfaceRumbleRL_2: 0,
    SurfaceRumbleRR_2: 0,
    TireSlipCombinedFL_2: 0,
    TireTempFL: coreFL,
    TireTempFR: coreFR,
    TireTempRL: coreRL,
    TireTempRR: coreRR,
    TireCarcassTempFL: coreFL,
    TireCarcassTempFR: coreFR,
    TireCarcassTempRL: coreRL,
    TireCarcassTempRR: coreRR,
    TireSurfaceTempInnerFL: innerFL,
    TireSurfaceTempInnerFR: innerFR,
    TireSurfaceTempInnerRL: innerRL,
    TireSurfaceTempInnerRR: innerRR,
    TireSurfaceTempMiddleFL: middleFL,
    TireSurfaceTempMiddleFR: middleFR,
    TireSurfaceTempMiddleRL: middleRL,
    TireSurfaceTempMiddleRR: middleRR,
    TireSurfaceTempOuterFL: outerFL,
    TireSurfaceTempOuterFR: outerFR,
    TireSurfaceTempOuterRL: outerRL,
    TireSurfaceTempOuterRR: outerRR,
    Boost: 0,
    Fuel: fuel,
    FuelCapacity: Number.isFinite(maxFuel) && maxFuel > 0 ? maxFuel : undefined,
    DistanceTraveled: distanceTraveled,
    BestLap: bestLap,
    LastLap: lastLap,
    CurrentLap: currentLap,
    CurrentRaceTime: currentLap,
    LapNumber: completedLaps + 1,
    RacePosition: position,
    Accel: accel,
    Brake: brakeVal,
    Clutch: Math.round(clutch * 255),
    HandBrake: 0,
    Gear: gear,
    Steer: steer,
    NormDrivingLine: 0,
    NormAIBrakeDiff: 0,
    TireWearFL: wearFL,
    TireWearFR: wearFR,
    TireWearRL: wearRL,
    TireWearRR: wearRR,
    SurfaceRumbleFL: 0,
    SurfaceRumbleFR: 0,
    SurfaceRumbleRL: 0,
    SurfaceRumbleRR: 0,
    TireSlipAngleFL: 0,
    TireSlipAngleFR: 0,
    TireSlipAngleRL: 0,
    TireSlipAngleRR: 0,
    TireCombinedSlipFL: combinedSlipFL,
    TireCombinedSlipFR: combinedSlipFR,
    TireCombinedSlipRL: combinedSlipRL,
    TireCombinedSlipRR: combinedSlipRR,
    SuspensionTravelMFL: suspFL,
    SuspensionTravelMFR: suspFR,
    SuspensionTravelMRL: suspRL,
    SuspensionTravelMRR: suspRR,
    TirePressureFrontLeft: pressFL,
    TirePressureFrontRight: pressFR,
    TirePressureRearLeft: pressRL,
    TirePressureRearRight: pressRR,
    BrakeTempFrontLeft: brTempFL,
    BrakeTempFrontRight: brTempFR,
    BrakeTempRearLeft: brTempRL,
    BrakeTempRearRight: brTempRR,
    CarOrdinal: overrides?.carOrdinal ?? 0,
    CarClass: 0,
    CarPerformanceIndex: 0,
    DrivetrainType: 1,
    NumCylinders: 0,
    PositionX: carX,
    PositionY: carY,
    PositionZ: carZ,
    Speed: speed,
    Power: 0,
    Torque: 0,
    TrackOrdinal: overrides?.trackOrdinal ?? 0,
    WeatherType: 0,
    TrackTemp: roadTempC,
    AirTemp: airTempC,
    RainPercent: 0,
  };
  return packet;
}
