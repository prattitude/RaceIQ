import type { GameAdapter } from "../types";

export const acAdapter: GameAdapter = {
  id: "ac",
  displayName: "Assetto Corsa",
  shortName: "AC",
  routePrefix: "ac",
  telemetry: {
    fuel: { packetUnit: "litre", binding: { kind: "value", semanticId: "fuel.fuel" } },
    tireTemperature: { packetUnit: "celsius", binding: { kind: "value", semanticId: "tire.temperature.surface.representative" } },
    tireCarcassTemperature: { packetUnit: "celsius", binding: { kind: "value", semanticId: "tire.temperature.core" } },
    tirePressure: { packetUnit: "psi", binding: { kind: "value", semanticId: "tires.tire-pressure" } },
    pitStatus: { source: "direct", freshness: "continuous", binding: { kind: "value", semanticId: "race.pit-status" } },
    analysis: {
      // AC 1.16 leaves slipRatio[4] and slipAngle[4] at zero, so every
      // slip-angle derivation is unavailable rather than reading zeros.
      balance: { source: "unavailable", reason: "source-limitation" },
      brakeBias: { source: "direct", freshness: "continuous", binding: { kind: "value", semanticId: "brakes.brake-bias" } },
      gForce: { source: "derived", confidence: "exact", binding: { kind: "derived", derivation: "g-force-v1", requires: ["motion.acceleration-x", "motion.acceleration-z"] } },
      gripDemand: { source: "unavailable", reason: "source-limitation" },
      traction: { source: "derived", confidence: "exact", display: "per-wheel", binding: { kind: "derived", derivation: "traction-v1", requires: ["motion.speed", "inputs.steer", "tires.wheel-rotation-speed"] } },
      tireTemperature: { source: "direct", freshness: "continuous", display: "per-wheel", binding: { kind: "value", semanticId: "tire.temperature.surface.representative" } },
      surface: { source: "unavailable", reason: "source-limitation" },
      slipRatio: { source: "unavailable", reason: "source-limitation" },
      slipAngle: { source: "unavailable", reason: "source-limitation" },
      lateralSlip: { source: "unavailable", reason: "source-limitation" },
      wheelRotation: { source: "direct", freshness: "continuous", display: "per-wheel", binding: { kind: "value", semanticId: "tires.wheel-rotation-speed" } },
      tireHealth: { source: "unavailable", reason: "missing-model" },
      tireWearRate: { source: "unavailable", reason: "missing-model" },
      tirePressure: { source: "direct", freshness: "continuous", display: "per-wheel", binding: { kind: "value", semanticId: "tires.tire-pressure" } },
      suspensionTravel: { source: "direct", freshness: "continuous", display: "normalized", binding: { kind: "value", semanticId: "suspension.norm-suspension-travel" } },
      suspensionCompressionBias: { source: "derived", confidence: "exact", display: "compression-bias", binding: { kind: "derived", derivation: "compression-bias-v1", requires: ["suspension.norm-suspension-travel"] } },
    },
  },
  coordSystem: "standard-xyz",
  nativeSectors: false,
  appendsDelayedFinishFrame: true,
  authoritativeTrackLength: false,
  steeringCenter: 0,
  // Steer is emitted as steerAngle(-1..1) × 127 by the parser, so the usable
  // range is 127; corner detection scales its steering thresholds by this.
  steeringRange: 127,
  tireHealthThresholds: { green: 0.85, yellow: 0.70 },
  tireTempThresholds: { cold: 60, warm: 95, hot: 115 },
  suspensionThresholds: { values: [25, 65, 85] },

  // Stubs — server adapter overrides with catalog and discovered-car lookups
  getCarName(ordinal: number): string {
    return `Car #${ordinal}`;
  },

  getTrackName(ordinal: number): string {
    return `Track #${ordinal}`;
  },

  getSharedTrackName(_ordinal: number): string | undefined {
    return undefined;
  },

  carForwardOffset(yaw) { return [Math.sin(yaw), Math.cos(yaw)]; },
  followViewRotation(yaw) { return Math.PI - yaw; },
};
