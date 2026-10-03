/**
 * Original Assetto Corsa (acs.exe) shared memory struct definitions.
 *
 * Offsets follow the AC shared memory header v1.7 with #pragma pack(4) and
 * were verified field-by-field against a live AC 1.16.4 capture. ACC inherits
 * this physics and static layout, but AC's SPageFileGraphic is a single-car
 * struct that diverges from ACC after normalizedCarPosition (offset 248).
 *
 * AC 1.16.4 leaves several declared fields at zero: slipRatio, slipAngle,
 * mz/fx/fy, suspensionDamage, and the tyreTemp alias (offset 592 onward
 * except currentMaxRpm). They are intentionally not exposed here.
 */

// --- SPageFilePhysics ---
export const PHYSICS = {
  SIZE: 712,
  packetId:       { offset: 0, type: "i32" },
  gas:            { offset: 4, type: "f32" },
  brake:          { offset: 8, type: "f32" },
  fuel:           { offset: 12, type: "f32" },     // litres remaining
  gear:           { offset: 16, type: "i32" },     // 0=R, 1=N, 2=1st...
  rpms:           { offset: 20, type: "i32" },
  steerAngle:     { offset: 24, type: "f32" },     // -1..1
  speedKmh:       { offset: 28, type: "f32" },
  velocityX:      { offset: 32, type: "f32" },
  velocityY:      { offset: 36, type: "f32" },
  velocityZ:      { offset: 40, type: "f32" },
  accGX:          { offset: 44, type: "f32" },
  accGY:          { offset: 48, type: "f32" },
  accGZ:          { offset: 52, type: "f32" },
  // wheelSlip[4] — combined slip magnitude
  wheelSlipFL:    { offset: 56, type: "f32" },
  wheelSlipFR:    { offset: 60, type: "f32" },
  wheelSlipRL:    { offset: 64, type: "f32" },
  wheelSlipRR:    { offset: 68, type: "f32" },
  // wheelLoad[4] — vertical load per tyre (N)
  wheelLoadFL:    { offset: 72, type: "f32" },
  wheelLoadFR:    { offset: 76, type: "f32" },
  wheelLoadRL:    { offset: 80, type: "f32" },
  wheelLoadRR:    { offset: 84, type: "f32" },
  // wheelsPressure[4] — PSI
  tyrePressureFL: { offset: 88, type: "f32" },
  tyrePressureFR: { offset: 92, type: "f32" },
  tyrePressureRL: { offset: 96, type: "f32" },
  tyrePressureRR: { offset: 100, type: "f32" },
  // wheelAngularSpeed[4] — rad/s
  wheelRotFL:     { offset: 104, type: "f32" },
  wheelRotFR:     { offset: 108, type: "f32" },
  wheelRotRL:     { offset: 112, type: "f32" },
  wheelRotRR:     { offset: 116, type: "f32" },
  // tyreWear[4] (120-132) — AC grip-remaining scale (~100 when new); no RaceIQ wear semantic yet
  // tyreDirtyLevel[4] (136-148) — skipped
  // tyreCoreTemperature[4] — °C
  tyreCoreFL:     { offset: 152, type: "f32" },
  tyreCoreFR:     { offset: 156, type: "f32" },
  tyreCoreRL:     { offset: 160, type: "f32" },
  tyreCoreRR:     { offset: 164, type: "f32" },
  // camberRAD[4] — radians
  camberFL:       { offset: 168, type: "f32" },
  camberFR:       { offset: 172, type: "f32" },
  camberRL:       { offset: 176, type: "f32" },
  camberRR:       { offset: 180, type: "f32" },
  // suspensionTravel[4] — metres
  suspTravelFL:   { offset: 184, type: "f32" },
  suspTravelFR:   { offset: 188, type: "f32" },
  suspTravelRL:   { offset: 192, type: "f32" },
  suspTravelRR:   { offset: 196, type: "f32" },
  drs:            { offset: 200, type: "f32" },
  tc:             { offset: 204, type: "f32" },
  heading:        { offset: 208, type: "f32" },
  pitch:          { offset: 212, type: "f32" },
  roll:           { offset: 216, type: "f32" },
  cgHeight:       { offset: 220, type: "f32" },
  // carDamage[5]
  damFront:       { offset: 224, type: "f32" },
  damRear:        { offset: 228, type: "f32" },
  damLeft:        { offset: 232, type: "f32" },
  damRight:       { offset: 236, type: "f32" },
  damCentre:      { offset: 240, type: "f32" },
  numberOfTyresOut: { offset: 244, type: "i32" },  // tyres off the track surface, 0..4
  pitLimiterOn:   { offset: 248, type: "i32" },
  abs:            { offset: 252, type: "f32" },
  // kersCharge (256), kersInput (260), autoShifterOn (264)
  // rideHeight[2] — front, rear (m)
  rideHeightF:    { offset: 268, type: "f32" },
  rideHeightR:    { offset: 272, type: "f32" },
  turboBoost:     { offset: 276, type: "f32" },
  // ballast (280), airDensity (284)
  airTemp:        { offset: 288, type: "f32" },
  roadTemp:       { offset: 292, type: "f32" },
  // localAngularVel[3] — car-local rates: [0]=pitch (X), [1]=yaw (Y), [2]=roll (Z)
  localAngularVelX: { offset: 296, type: "f32" },
  localAngularVelY: { offset: 300, type: "f32" },
  localAngularVelZ: { offset: 304, type: "f32" },
  // finalFF (308), performanceMeter (312)
  // engineBrake (316), ersRecoveryLevel (320), ersPowerLevel (324)
  // ersHeatCharging (328), ersIsCharging (332), kersCurrentKJ (336)
  drsAvailable:   { offset: 340, type: "i32" },
  drsEnabled:     { offset: 344, type: "i32" },
  // brakeTemp[4] (348-360) — AC 1.16.4 reports a constant 12 °C without CSP brake heating; not exposed
  clutch:         { offset: 364, type: "f32" },
  // tyreTempI/M/O[4] — inner / middle / outer surface °C
  tyreTempInnerFL: { offset: 368, type: "f32" },
  tyreTempInnerFR: { offset: 372, type: "f32" },
  tyreTempInnerRL: { offset: 376, type: "f32" },
  tyreTempInnerRR: { offset: 380, type: "f32" },
  tyreTempMiddleFL: { offset: 384, type: "f32" },
  tyreTempMiddleFR: { offset: 388, type: "f32" },
  tyreTempMiddleRL: { offset: 392, type: "f32" },
  tyreTempMiddleRR: { offset: 396, type: "f32" },
  tyreTempOuterFL: { offset: 400, type: "f32" },
  tyreTempOuterFR: { offset: 404, type: "f32" },
  tyreTempOuterRL: { offset: 408, type: "f32" },
  tyreTempOuterRR: { offset: 412, type: "f32" },
  // isAIControlled (416)
  // tyreContactPoint[4][3] (420-468), tyreContactNormal[4][3] (468-516)
  contactHeadingBase: { offset: 516, type: "f32" }, // stride: 12 bytes (3 floats) per tire, FL/FR/RL/RR
  brakeBias:      { offset: 564, type: "f32" },
  // localVelocity[3] (568-576)
  // P2PActivations (580), P2PStatus (584)
  currentMaxRpm:  { offset: 588, type: "i32" },
} as const;

// --- SPageFileGraphic (AC single-car layout) ---
export const GRAPHICS = {
  SIZE: 296,
  packetId:         { offset: 0, type: "i32" },
  status:           { offset: 4, type: "i32" },
  session:          { offset: 8, type: "i32" },
  // currentTime/lastTime/bestTime/split wchar_t[15] at 12/42/72/102
  completedLaps:    { offset: 132, type: "i32" },
  position:         { offset: 136, type: "i32" },
  iCurrentTime:     { offset: 140, type: "i32" },   // ms
  iLastTime:        { offset: 144, type: "i32" },   // ms
  iBestTime:        { offset: 148, type: "i32" },   // ms
  sessionTimeLeft:  { offset: 152, type: "f32" },
  distanceTraveled: { offset: 156, type: "f32" },   // metres this session
  isInPit:          { offset: 160, type: "i32" },
  currentSectorIndex: { offset: 164, type: "i32" },
  lastSectorTime:   { offset: 168, type: "i32" },   // ms
  numberOfLaps:     { offset: 172, type: "i32" },
  currentTyreCompound: { offset: 176, size: 66, type: "wstring" },
  // replayTimeMultiplier (244)
  normalizedCarPosition: { offset: 248, type: "f32" },
  carX:             { offset: 252, type: "f32" },
  carY:             { offset: 256, type: "f32" },
  carZ:             { offset: 260, type: "f32" },
  penaltyTime:      { offset: 264, type: "f32" },
  flag:             { offset: 268, type: "i32" },
  // idealLineOn (272)
  isInPitLane:      { offset: 276, type: "i32" },
  surfaceGrip:      { offset: 280, type: "f32" },
  // mandatoryPitDone (284)
  windSpeed:        { offset: 288, type: "f32" },
  windDirection:    { offset: 292, type: "f32" },
} as const;

// --- SPageFileStatic (shared with ACC up to offset 684) ---
export const STATIC = {
  SIZE: 684,
  smVersion:        { offset: 0, size: 30, type: "wstring" },
  acVersion:        { offset: 30, size: 30, type: "wstring" },
  numberOfSessions: { offset: 60, type: "i32" },
  numCars:          { offset: 64, type: "i32" },
  carModel:         { offset: 68, size: 66, type: "wstring" },
  track:            { offset: 134, size: 66, type: "wstring" },
  playerName:       { offset: 200, size: 66, type: "wstring" },
  sectorCount:      { offset: 400, type: "i32" },
  maxRpm:           { offset: 412, type: "i32" },
  maxFuel:          { offset: 416, type: "f32" },
  suspMaxFL:        { offset: 420, type: "f32" },
  suspMaxFR:        { offset: 424, type: "f32" },
  suspMaxRL:        { offset: 428, type: "f32" },
  suspMaxRR:        { offset: 432, type: "f32" },
  tyreRadiusFL:     { offset: 436, type: "f32" },
  tyreRadiusFR:     { offset: 440, type: "f32" },
  tyreRadiusRL:     { offset: 444, type: "f32" },
  tyreRadiusRR:     { offset: 448, type: "f32" },
  penaltiesEnabled: { offset: 464, type: "i32" },
  trackSplineLength: { offset: 520, type: "f32" },
  trackConfiguration: { offset: 524, size: 66, type: "wstring" },
} as const;

export const AC_STATUS = {
  AC_OFF: 0,
  AC_REPLAY: 1,
  AC_LIVE: 2,
  AC_PAUSE: 3,
} as const;

/** AC_SESSION_TYPE from the AC shared memory header. */
export const SESSION_TYPE_NAMES: Record<number, string> = {
  [-1]: "unknown",
  0: "practice",
  1: "qualifying",
  2: "race",
  3: "hotlap",
  4: "time-attack",
  5: "drift",
  6: "drag",
};

/** AC_FLAG_TYPE from the AC shared memory header. */
export const FLAG_STATUS: Record<number, string> = {
  0: "none",
  1: "blue",
  2: "yellow",
  3: "black",
  4: "white",
  5: "checkered",
  6: "penalty",
};
