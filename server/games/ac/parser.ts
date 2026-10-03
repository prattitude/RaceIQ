/**
 * Original Assetto Corsa parser: converts raw shared memory pages into a
 * TelemetryPacket. Offsets match the AC v1.7 structs in structs.ts.
 */

import type { TelemetryPacket } from "../../../shared/telemetry/types";
import type { KunosExtendedData } from "../../../shared/telemetry/kunos";
import { getAcTrackByIdentity } from "../../../shared/racing/tracks/catalogs/ac";
import { readWString } from "../acc/utils";
import { FLAG_STATUS, GRAPHICS, PHYSICS, SESSION_TYPE_NAMES, STATIC } from "./structs";

export interface AcIdentity {
  /** Raw content folder name from static.carModel. */
  carModel: string;
  /** Bundled catalog ordinal for static.track + static.trackConfiguration, or -1. */
  trackOrdinal: number;
}

/** Read car folder and resolve the track layout from the static page. */
export function resolveAcIdentity(staticBuf: Buffer): AcIdentity {
  if (staticBuf.length < STATIC.SIZE) return { carModel: "", trackOrdinal: -1 };
  const carModel = readWString(staticBuf, STATIC.carModel.offset, STATIC.carModel.size);
  const track = readWString(staticBuf, STATIC.track.offset, STATIC.track.size);
  const layout = readWString(staticBuf, STATIC.trackConfiguration.offset, STATIC.trackConfiguration.size);
  return { carModel, trackOrdinal: getAcTrackByIdentity(track, layout)?.id ?? -1 };
}

/**
 * Parse the three AC shared memory pages into a unified TelemetryPacket.
 * Returns null if any page is smaller than its struct.
 *
 * `carOrdinal` < 0 means the car is not yet registered; the raw folder name
 * is surfaced as `carModelName` so the lap detector can register it.
 */
export function parseAcBuffers(
  physicsBuf: Buffer,
  graphicsBuf: Buffer,
  staticBuf: Buffer,
  overrides?: { carOrdinal?: number; trackOrdinal?: number },
): TelemetryPacket | null {
  if (
    physicsBuf.length < PHYSICS.SIZE ||
    graphicsBuf.length < GRAPHICS.SIZE ||
    staticBuf.length < STATIC.SIZE
  ) {
    return null;
  }

  // --- Physics ---
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
  const heading3 = (wheel: number): [number, number, number] => [
    physicsBuf.readFloatLE(chBase + wheel * 12),
    physicsBuf.readFloatLE(chBase + wheel * 12 + 4),
    physicsBuf.readFloatLE(chBase + wheel * 12 + 8),
  ];
  const contactHeading: KunosExtendedData["tireContactHeading"] = [heading3(0), heading3(1), heading3(2), heading3(3)];

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

  const damFront = physicsBuf.readFloatLE(PHYSICS.damFront.offset);
  const damRear = physicsBuf.readFloatLE(PHYSICS.damRear.offset);
  const damLeft = physicsBuf.readFloatLE(PHYSICS.damLeft.offset);
  const damRight = physicsBuf.readFloatLE(PHYSICS.damRight.offset);
  const damCentre = physicsBuf.readFloatLE(PHYSICS.damCentre.offset);

  // AC physics tc/abs are the selected aid levels, not activity signals.
  const tcLevel = physicsBuf.readFloatLE(PHYSICS.tc.offset);
  const absLevel = physicsBuf.readFloatLE(PHYSICS.abs.offset);
  const brakeBias = physicsBuf.readFloatLE(PHYSICS.brakeBias.offset);
  const currentMaxRpm = physicsBuf.readInt32LE(PHYSICS.currentMaxRpm.offset);
  const numberOfTyresOut = physicsBuf.readInt32LE(PHYSICS.numberOfTyresOut.offset);
  const drsAvailable = physicsBuf.readInt32LE(PHYSICS.drsAvailable.offset) !== 0;
  const drsEnabled = physicsBuf.readInt32LE(PHYSICS.drsEnabled.offset) !== 0;

  // --- Graphics ---
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
  const penaltyTime = graphicsBuf.readFloatLE(GRAPHICS.penaltyTime.offset);
  const windSpeed = graphicsBuf.readFloatLE(GRAPHICS.windSpeed.offset);
  const windDirection = graphicsBuf.readFloatLE(GRAPHICS.windDirection.offset);
  const carX = graphicsBuf.readFloatLE(GRAPHICS.carX.offset);
  const carY = graphicsBuf.readFloatLE(GRAPHICS.carY.offset);
  const carZ = graphicsBuf.readFloatLE(GRAPHICS.carZ.offset);
  const tireCompound = readWString(graphicsBuf, GRAPHICS.currentTyreCompound.offset, GRAPHICS.currentTyreCompound.size);

  // --- Static ---
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

  // --- Derived values ---
  const gear = acGear <= 1 ? 0 : acGear - 1;
  const INV = 0x7fffffff;
  const currentLap = iCurrentTime > 0 && iCurrentTime !== INV ? iCurrentTime / 1000 : 0;
  const lastLap = iLastTime > 0 && iLastTime !== INV ? iLastTime / 1000 : 0;
  const bestLap = iBestTime > 0 && iBestTime !== INV ? iBestTime / 1000 : 0;

  let pitStatus = "out";
  if (isInPit) pitStatus = "in_pit";
  else if (isInPitLane) pitStatus = "pit_lane";

  const carOrdinal = overrides?.carOrdinal ?? -1;
  const carModel = carOrdinal < 0
    ? readWString(staticBuf, STATIC.carModel.offset, STATIC.carModel.size)
    : "";

  const acc: KunosExtendedData = {
    sessionType: SESSION_TYPE_NAMES[graphicsBuf.readInt32LE(GRAPHICS.session.offset)] ?? "unknown",
    penaltyTime,
    tireCompound,
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
    // AC publishes no brake pad compound or wear; -1 is the unavailable sentinel.
    brakePadCompound: 0,
    brakePadWear: [-1, -1, -1, -1],
    // AC graphics has no TC/TC Cut/ABS/engine-map setting levels.
    tc: 0,
    tcCut: 0,
    abs: 0,
    engineMap: 0,
    brakeBias,
    tcIntervention: 0,
    absIntervention: 0,
    tcRaw: tcLevel,
    absRaw: absLevel,
    slipVibrations: 0,
    absVibrations: 0,
    rainIntensity: 0,
    trackGripStatus: "unknown",
    windSpeed,
    windDirection,
    airTempC,
    roadTempC,
    flagStatus: FLAG_STATUS[flag] ?? "none",
    drsAvailable,
    drsEnabled,
    pitStatus,
    isValidLap: null,
    numberOfTyresOut,
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
    gameId: "ac",
    acc,
    IsRaceOn: status === 2 ? 1 : 0,
    TimestampMS: Date.now(),

    EngineMaxRpm: currentMaxRpm || maxRpm,
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

    // AC 1.16 declares slipRatio[4] but leaves it zero.
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

    // AC exposes core plus inner/middle/outer surface temperatures.
    TireTempFL: middleFL,
    TireTempFR: middleFR,
    TireTempRL: middleRL,
    TireTempRR: middleRR,
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

    Accel: Math.round(gas * 255),
    Brake: Math.round(brake * 255),
    Clutch: 0,
    HandBrake: 0,
    Gear: gear,
    Steer: Math.round(steerAngle * 127),
    NormDrivingLine: 0,
    NormAIBrakeDiff: 0,

    // AC tyreWear is a grip-remaining scale with no RaceIQ wear semantic yet.
    TireWearFL: -1,
    TireWearFR: -1,
    TireWearRL: -1,
    TireWearRR: -1,

    SurfaceRumbleFL: 0,
    SurfaceRumbleFR: 0,
    SurfaceRumbleRL: 0,
    SurfaceRumbleRR: 0,
    // AC 1.16 declares slipAngle[4] but leaves it zero.
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

    // AC brakeTemp[4] reports a constant ambient value without CSP; not a real channel.
    BrakeTempFrontLeft: 0,
    BrakeTempFrontRight: 0,
    BrakeTempRearLeft: 0,
    BrakeTempRearRight: 0,

    CarOrdinal: carOrdinal,
    ...(carModel ? { carModelName: carModel } : {}),
    CarClass: 0,
    CarPerformanceIndex: 0,
    DrivetrainType: 1,
    NumCylinders: 0,

    PositionX: carX,
    PositionY: carY,
    PositionZ: carZ,
    Speed: speedKmh / 3.6,
    Power: 0,
    Torque: 0,
    TrackOrdinal: overrides?.trackOrdinal ?? -1,

    WeatherType: 0,
    TrackTemp: roadTempC,
    AirTemp: airTempC,
    RainPercent: 0,
  };

  return packet;
}
