import { describe, expect, test } from "bun:test";
import { mergeCuePlanFromParts } from "@raceiq/backend-core/trailbrake/cue-plan";
import type { SegmentStat } from "@raceiq/backend-core/lap-analysis/metrics";
import type { LapInsight } from "@raceiq/analysis-core/racing/analysis/laps/insights/types";

function corner(name: string, startFrac: number, endFrac: number, brakeOnDist: number): SegmentStat {
  return {
    name,
    type: "corner",
    startFrac,
    endFrac,
    timeSec: 2,
    stats: {
      throttleAvg: 0.4,
      throttleMax: 1,
      fullThrottlePctDist: 0.2,
      brakeAvg: 0.3,
      brakeMax: 0.9,
      brakingPctDist: 0.3,
      brakeApplications: 1,
      steerAbsAvg: 0.2,
      steerAbsMax: 0.8,
      steeringSmoothness: 0.9,
      brakeOnDist,
      brakeOffDist: brakeOnDist + 40,
      peakBrakeValue: 0.9,
      peakBrakeDist: brakeOnDist + 10,
      fullThrottleDist: null,
      liftOffThrottleDist: null,
      minSpeed: 80,
      minSpeedDist: brakeOnDist + 20,
      maxSpeed: 180,
      maxSpeedDist: brakeOnDist - 50,
    },
  };
}

describe("mergeCuePlanFromParts", () => {
  test("uses analyst fix text when corner labels match", () => {
    const segments = [corner("T1", 0.1, 0.18, 420), corner("T2", 0.3, 0.38, 980)];
    const insights: LapInsight[] = [];
    const analysis = JSON.stringify({
      verdict: "Solid lap",
      pace: [],
      handling: [],
      corners: [
        { name: "T1", issue: "Late brake", fix: "Brake earlier and trail to apex", severity: "moderate" },
      ],
      braking: [
        { corner: "T1", assessment: "warning", brakePoint: "earlier", detail: "You are braking late" },
      ],
      technique: [],
      setup: [],
    });

    const plan = mergeCuePlanFromParts(7, segments, insights, analysis, "2026-01-01T00:00:00.000Z");
    expect(plan.lapId).toBe(7);
    expect(plan.hasAnalysis).toBe(true);
    expect(plan.corners).toHaveLength(2);
    expect(plan.corners[0]?.callText).toBe("Brake T1");
    expect(plan.corners[0]?.tipText).toContain("Brake earlier");
    expect(plan.corners[0]?.brakeOnDist).toBe(420);
    expect(plan.corners[0]?.trailStartDist).toBeGreaterThan(420);
    expect(plan.corners[0]?.throttleOnDist).toBe(468);
    expect(plan.corners[0]?.severity).toBe("moderate");
    expect(plan.corners[1]?.tipText).toContain("980");
  });

  test("falls back to metrics when analysis is missing", () => {
    const plan = mergeCuePlanFromParts(3, [corner("Hairpin", 0.5, 0.6, 1500)], [], null, null);
    expect(plan.hasAnalysis).toBe(false);
    expect(plan.corners[0]?.name).toBe("Hairpin");
    expect(plan.corners[0]?.tipText).toContain("1500");
  });
});
