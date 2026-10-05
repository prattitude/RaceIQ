import type { GameAdapter } from "@raceiq/shared/games/types";
import { getAcCarName, getAcTrackName, getAcTrackOrdinalByName } from "./identity";

export const acAdapter: GameAdapter = {
  id: "ac",
  displayName: "Assetto Corsa",
  shortName: "AC",
  routePrefix: "ac",
  telemetry: {
    fuel: { packetUnit: "litre", binding: { kind: "value", semanticId: "fuel.fuel" } },
    tireTemperature: { packetUnit: "celsius", binding: { kind: "value", semanticId: "tire.temperature.core" } },
    tireCarcassTemperature: { packetUnit: "celsius", binding: { kind: "value", semanticId: "tire.temperature.core" } },
    tireSurfaceProfile: {
      source: "direct",
      freshness: "continuous",
      binding: {
        kind: "group",
        required: [
          "tire.temperature.surface.inner",
          "tire.temperature.surface.middle",
          "tire.temperature.surface.outer",
        ],
      },
    },
    brakeTemperature: { packetUnit: "celsius", binding: { kind: "value", semanticId: "brakes.brake-temp" } },
    tirePressure: { packetUnit: "psi", binding: { kind: "value", semanticId: "tires.tire-pressure" } },
    clutch: {
      source: "direct",
      freshness: "continuous",
      binding: { kind: "value", semanticId: "inputs.clutch" },
    },
    pitStatus: { source: "direct", freshness: "continuous", binding: { kind: "value", semanticId: "race.pit-status" } },
    analysis: {
      balance: {
        source: "derived",
        confidence: "high",
        binding: {
          kind: "derived",
          derivation: "physical-balance-v1",
          requires: ["motion.speed", "motion.acceleration-x", "motion.angular-velocity-y", "tires.tire-slip-angle"],
        },
      },
      brakeBias: { source: "direct", freshness: "continuous", binding: { kind: "value", semanticId: "brakes.brake-bias" } },
      gForce: {
        source: "derived",
        confidence: "exact",
        binding: { kind: "derived", derivation: "g-force-v1", requires: ["motion.acceleration-x", "motion.acceleration-z"] },
      },
      gripDemand: {
        source: "derived",
        confidence: "high",
        display: "per-wheel",
        binding: {
          kind: "derived",
          derivation: "friction-circle-v1",
          requires: ["motion.speed", "tires.wheel-rotation-speed", "tires.tire-slip-angle"],
        },
      },
      traction: {
        source: "derived",
        confidence: "exact",
        display: "per-wheel",
        binding: {
          kind: "derived",
          derivation: "traction-v1",
          requires: ["motion.speed", "inputs.steer", "tires.wheel-rotation-speed"],
        },
      },
      tireTemperature: {
        source: "direct",
        freshness: "continuous",
        display: "per-wheel",
        binding: { kind: "value", semanticId: "tire.temperature.core" },
      },
      surface: { source: "unavailable", reason: "source-limitation" },
      slipRatio: { source: "unavailable", reason: "source-limitation" },
      slipAngle: { source: "unavailable", reason: "source-limitation" },
      lateralSlip: { source: "unavailable", reason: "source-limitation" },
      wheelRotation: {
        source: "direct",
        freshness: "continuous",
        display: "per-wheel",
        binding: { kind: "value", semanticId: "tires.wheel-rotation-speed" },
      },
      tireHealth: {
        source: "direct",
        freshness: "continuous",
        display: "per-wheel",
        binding: { kind: "value", semanticId: "tires.tire-wear" },
      },
      tireWearRate: {
        source: "derived",
        confidence: "high",
        display: "per-wheel",
        binding: { kind: "derived", derivation: "wear-rate-v1", requires: ["tires.tire-wear"] },
      },
      tirePressure: {
        source: "direct",
        freshness: "continuous",
        display: "per-wheel",
        binding: { kind: "value", semanticId: "tires.tire-pressure" },
      },
      suspensionTravel: {
        source: "direct",
        freshness: "continuous",
        display: "normalized",
        binding: { kind: "value", semanticId: "suspension.norm-suspension-travel" },
      },
      suspensionCompressionBias: {
        source: "derived",
        confidence: "exact",
        display: "compression-bias",
        binding: {
          kind: "derived",
          derivation: "compression-bias-v1",
          requires: ["suspension.norm-suspension-travel"],
        },
      },
    },
  },
  coordSystem: "standard-xyz",
  nativeSectors: false,
  appendsDelayedFinishFrame: true,
  authoritativeTrackLength: false,
  steeringCenter: 0,
  steeringRange: 127,
  tireHealthThresholds: { green: 0.85, yellow: 0.70 },
  tireTempThresholds: { cold: 70, warm: 100, hot: 120 },
  suspensionThresholds: { values: [25, 65, 85] },
  tirePressureOptimal: { min: 26, max: 30 },
  brakeTempThresholds: {
    front: { warm: 400, hot: 750 },
    rear: { warm: 350, hot: 700 },
  },

  getCarName(ordinal: number): string {
    return getAcCarName(ordinal);
  },

  getTrackName(ordinal: number): string {
    return getAcTrackName(ordinal);
  },

  getSharedTrackName(_ordinal: number): string | undefined {
    return undefined;
  },

  getTrackOrdinalByName(name: string): number | undefined {
    return getAcTrackOrdinalByName(name);
  },

  carForwardOffset(yaw) {
    return [Math.sin(yaw), Math.cos(yaw)];
  },
  followViewRotation(yaw) {
    return Math.PI - yaw;
  },
};
