/**
 * Decode an original Assetto Corsa capture against the AC 1.7 shared-memory
 * layout and report page extents, channel ranges, lap boundaries, pit
 * transitions, and tyres-out counts per lap.
 *
 * Walks raw frames rather than `readKunosFrames`, because the AC capture
 * writes graphics only when its packet id changes and that reader drops
 * physics polls without a paired graphics frame.
 *
 * Usage: bun scripts/telemetry/ac/inspect-capture.ts <capture.bin[.gz]>
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { readWString } from "../../../server/games/acc/utils";

const path = process.argv[2];
if (!path) {
  console.error("Usage: bun scripts/telemetry/ac/inspect-capture.ts <capture.bin[.gz]>");
  process.exit(1);
}

const raw = readFileSync(path);
const data = path.endsWith(".gz") ? gunzipSync(raw) : raw;
if (data.length < 16 || data.toString("ascii", 0, 7) !== "ACCTEST") {
  console.error("Not a Kunos ACCTEST capture");
  process.exit(1);
}

// AC 1.7 SPageFilePhysics (base 712 bytes)
const P = {
  packetId: 0, gas: 4, brake: 8, fuel: 12, gear: 16, rpms: 20, steerAngle: 24, speedKmh: 28,
  wheelsPressure: 88, tyreCoreTemperature: 152, suspensionTravel: 184, heading: 208,
  numberOfTyresOut: 244, pitLimiterOn: 248, brakeTemp: 348, clutch: 364, tyreTempM: 384,
  brakeBias: 564, currentMaxRpm: 588, slipRatio: 640, slipAngle: 656, tyreTemp: 696,
} as const;
// AC 1.7 SPageFileGraphic
const G = {
  packetId: 0, status: 4, session: 8, completedLaps: 132, position: 136, iCurrentTime: 140,
  iLastTime: 144, iBestTime: 148, distanceTraveled: 156, isInPit: 160, currentSectorIndex: 164,
  lastSectorTime: 168, numberOfLaps: 172, tyreCompound: 176, normalizedCarPosition: 248,
  carX: 252, carZ: 260, penaltyTime: 264, flag: 268, isInPitLane: 276, surfaceGrip: 280,
} as const;

interface Range { min: number; max: number }
const ranges = new Map<string, Range>();
function track(name: string, value: number): void {
  if (!Number.isFinite(value)) return;
  const r = ranges.get(name);
  if (!r) ranges.set(name, { min: value, max: value });
  else {
    if (value < r.min) r.min = value;
    if (value > r.max) r.max = value;
  }
}

const extent = [0, 0, 0];
const sizes = [new Set<number>(), new Set<number>(), new Set<number>()];
const counts = [0, 0, 0];

interface LapRow {
  lap: number;
  startMs: number | null;
  physicsFrames: number;
  maxTyresOut: number;
  tyresOutFrames: number;
  sawPitLane: boolean;
  sawPit: boolean;
  maxSpeed: number;
  sectors: number[];
}
const laps: LapRow[] = [];
let current: LapRow | null = null;
let graphics: Buffer | null = null;
let lastCompleted = -1;
let lastSector = -1;
let lastPit = -1;
let lastPitLane = -1;
let lastStatus = -1;
let lastNorm = -1;
const events: string[] = [];
let staticText = "";

function newLap(lap: number): LapRow {
  return { lap, startMs: null, physicsFrames: 0, maxTyresOut: 0, tyresOutFrames: 0, sawPitLane: false, sawPit: false, maxSpeed: 0, sectors: [] };
}

function onGraphics(g: Buffer): void {
  const status = g.readInt32LE(G.status);
  const completed = g.readInt32LE(G.completedLaps);
  const sector = g.readInt32LE(G.currentSectorIndex);
  const inPit = g.readInt32LE(G.isInPit);
  const inPitLane = g.readInt32LE(G.isInPitLane);
  const norm = g.readFloatLE(G.normalizedCarPosition);
  const cur = g.readInt32LE(G.iCurrentTime);
  track("g.iCurrentTime", cur);
  track("g.normalizedCarPosition", norm);
  track("g.surfaceGrip", g.readFloatLE(G.surfaceGrip));
  track("g.flag", g.readInt32LE(G.flag));
  track("g.session", g.readInt32LE(G.session));
  track("g.position", g.readInt32LE(G.position));
  track("g.numberOfLaps", g.readInt32LE(G.numberOfLaps));
  track("g.distanceTraveled", g.readFloatLE(G.distanceTraveled));
  track("g.carX", g.readFloatLE(G.carX));
  track("g.carZ", g.readFloatLE(G.carZ));
  track("g.penaltyTime", g.readFloatLE(G.penaltyTime));

  if (status !== lastStatus) {
    events.push(`status ${lastStatus} → ${status} (laps=${completed}, norm=${norm.toFixed(3)})`);
    lastStatus = status;
  }
  if (inPit !== lastPit || inPitLane !== lastPitLane) {
    events.push(`pit isInPit=${inPit} isInPitLane=${inPitLane} (laps=${completed}, norm=${norm.toFixed(3)}, t=${cur}ms)`);
    lastPit = inPit;
    lastPitLane = inPitLane;
  }
  if (lastNorm > 0.9 && norm < 0.1) {
    events.push(`normalizedCarPosition wrap ${lastNorm.toFixed(4)} → ${norm.toFixed(4)} (laps=${completed}, iCurrentTime=${cur})`);
  }
  lastNorm = norm;

  if (completed !== lastCompleted) {
    const lastMs = g.readInt32LE(G.iLastTime);
    const bestMs = g.readInt32LE(G.iBestTime);
    events.push(`completedLaps ${lastCompleted} → ${completed} iLastTime=${lastMs} iBestTime=${bestMs} lastSectorTime=${g.readInt32LE(G.lastSectorTime)}`);
    if (current) laps.push(current);
    current = newLap(completed);
    lastCompleted = completed;
    lastSector = sector;
  }
  if (current && sector !== lastSector) {
    current.sectors.push(g.readInt32LE(G.lastSectorTime));
    lastSector = sector;
  }
  if (current) {
    if (current.startMs === null) current.startMs = cur;
    if (inPit) current.sawPit = true;
    if (inPitLane) current.sawPitLane = true;
  }
}

function onPhysics(p: Buffer): void {
  track("p.gas", p.readFloatLE(P.gas));
  track("p.brake", p.readFloatLE(P.brake));
  track("p.clutch", p.readFloatLE(P.clutch));
  track("p.fuel", p.readFloatLE(P.fuel));
  track("p.gear", p.readInt32LE(P.gear));
  track("p.rpms", p.readInt32LE(P.rpms));
  track("p.steerAngle", p.readFloatLE(P.steerAngle));
  track("p.speedKmh", p.readFloatLE(P.speedKmh));
  track("p.heading", p.readFloatLE(P.heading));
  track("p.wheelsPressure[0]", p.readFloatLE(P.wheelsPressure));
  track("p.tyreCoreTemperature[0]", p.readFloatLE(P.tyreCoreTemperature));
  track("p.tyreTempM[0]", p.readFloatLE(P.tyreTempM));
  track("p.suspensionTravel[0]", p.readFloatLE(P.suspensionTravel));
  track("p.brakeTemp[0]", p.readFloatLE(P.brakeTemp));
  track("p.brakeBias", p.readFloatLE(P.brakeBias));
  track("p.pitLimiterOn", p.readInt32LE(P.pitLimiterOn));
  track("p.numberOfTyresOut", p.readInt32LE(P.numberOfTyresOut));
  if (p.length >= 712) {
    track("p.currentMaxRpm", p.readInt32LE(P.currentMaxRpm));
    track("p.slipRatio[0]", p.readFloatLE(P.slipRatio));
    track("p.slipAngle[0]", p.readFloatLE(P.slipAngle));
    track("p.tyreTemp[0]", p.readFloatLE(P.tyreTemp));
  }
  if (current && graphics && graphics.readInt32LE(G.status) === 2) {
    current.physicsFrames++;
    const out = p.readInt32LE(P.numberOfTyresOut);
    if (out > current.maxTyresOut) current.maxTyresOut = out;
    if (out > 2) current.tyresOutFrames++;
    const speed = p.readFloatLE(P.speedKmh);
    if (speed > current.maxSpeed) current.maxSpeed = speed;
  }
}

function lastNonZero(buf: Buffer): number {
  for (let i = buf.length - 1; i >= 0; i--) if (buf[i] !== 0) return i + 1;
  return 0;
}

let offset = 16;
while (offset + 5 <= data.length) {
  const type = data.readUInt8(offset);
  const size = data.readUInt32LE(offset + 1);
  offset += 5;
  if (offset + size > data.length) break;
  const frame = data.subarray(offset, offset + size);
  offset += size;
  if (type > 2) continue;
  counts[type]++;
  sizes[type].add(size);
  const end = lastNonZero(frame);
  if (end > extent[type]) extent[type] = end;
  if (type === 0) onPhysics(frame);
  else if (type === 1) {
    graphics = frame;
    onGraphics(frame);
  } else {
    staticText = [
      `sm=${readWString(frame, 0, 30)} ac=${readWString(frame, 30, 30)}`,
      `car=${readWString(frame, 68, 66)} track=${readWString(frame, 134, 66)}/${readWString(frame, 524, 66)}`,
      `sectorCount=${frame.readInt32LE(400)} maxRpm=${frame.readInt32LE(412)} maxFuel=${frame.readFloatLE(416).toFixed(1)}`,
      `trackSplineLength=${frame.readFloatLE(520).toFixed(1)} penaltiesEnabled=${frame.readInt32LE(464)} isOnline=${frame.length >= 688 ? frame.readInt32LE(684) : "n/a"}`,
    ].join("\n  ");
  }
}
if (current) laps.push(current);

const names = ["physics", "graphics", "static"];
console.log(`Frames: ${names.map((n, i) => `${n}=${counts[i]}`).join(" ")}`);
console.log(`Captured sizes: ${names.map((n, i) => `${n}=[${[...sizes[i]].join(",")}]`).join(" ")}`);
console.log(`Last non-zero byte: ${names.map((n, i) => `${n}=${extent[i]}`).join(" ")}`);
console.log(`Static:\n  ${staticText}`);

console.log("\nChannel ranges:");
for (const [name, r] of ranges) {
  console.log(`  ${name.padEnd(28)} ${r.min.toFixed(3).padStart(12)} … ${r.max.toFixed(3)}`);
}

console.log("\nEvents:");
for (const e of events) console.log(`  ${e}`);

console.log("\nLaps (by completedLaps value while driving it):");
for (const lap of laps) {
  console.log(
    `  lap#${lap.lap} physics=${lap.physicsFrames} maxTyresOut=${lap.maxTyresOut} framesOver2Out=${lap.tyresOutFrames} ` +
    `pit=${lap.sawPit} pitLane=${lap.sawPitLane} vmax=${lap.maxSpeed.toFixed(1)} sectorsMs=[${lap.sectors.join(",")}]`,
  );
}
