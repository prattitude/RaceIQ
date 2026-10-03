import type { TelemetryPacket } from "../../../shared/telemetry/types";

const fmt = (values: readonly number[], digits = 1): string =>
  `FL ${values[0].toFixed(digits)}, FR ${values[1].toFixed(digits)}, RL ${values[2].toFixed(digits)}, RR ${values[3].toFixed(digits)}`;

/** AI context limited to channels original AC actually publishes. */
export function buildAcAiContext(packets: TelemetryPacket[]): string {
  if (packets.length === 0) return "";
  const first = packets[0];
  const last = packets[packets.length - 1];
  const lines: string[] = [];

  if (first.acc) {
    if (first.acc.tireCompound) lines.push(`Tire compound: ${first.acc.tireCompound}`);
    lines.push(`Brake bias: ${(first.acc.brakeBias * 100).toFixed(1)}% front`);
    if (first.acc.airTempC != null && first.acc.roadTempC != null) {
      lines.push(`Air ${first.acc.airTempC.toFixed(0)}°C, road ${first.acc.roadTempC.toFixed(0)}°C`);
    }
  }

  if (last.acc) {
    lines.push(`Tire core temps (end) — ${fmt(last.acc.tireCoreTemp)} °C`);
    lines.push(`Tire inner/outer surface (end) — inner ${fmt(last.acc.tireInnerTemp)} °C; outer ${fmt(last.acc.tireOuterTemp)} °C`);
    const damage = last.acc.carDamage;
    if (Object.values(damage).some((v) => v > 0)) {
      lines.push(`Car damage — Front: ${damage.front.toFixed(2)}, Rear: ${damage.rear.toFixed(2)}, Left: ${damage.left.toFixed(2)}, Right: ${damage.right.toFixed(2)}`);
    }
  }
  const pressures = [last.TirePressureFrontLeft, last.TirePressureFrontRight, last.TirePressureRearLeft, last.TirePressureRearRight];
  if (pressures.every((p): p is number => typeof p === "number")) {
    lines.push(`Tire pressures (end) — ${fmt(pressures)} psi`);
  }

  const fuelUsed = first.Fuel - last.Fuel;
  if (fuelUsed > 0) lines.push(`Fuel used this lap: ${fuelUsed.toFixed(2)}L`);

  const speeds = packets.map((p) => p.Speed * 3.6);
  const maxSpeed = Math.max(...speeds);
  const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  lines.push(`Speed — Max: ${maxSpeed.toFixed(1)} km/h, Avg: ${avgSpeed.toFixed(1)} km/h`);

  return lines.join("\n");
}
