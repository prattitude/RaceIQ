import { describe, expect, test } from "bun:test";

/**
 * Ranking rules for Trailbrake reference selection (mirrors findTrailbrakeReferenceLap).
 * Kept as a pure unit so the preference order stays documented without a DB.
 */
function rankCandidates(
  laps: Array<{ id: number; lapTime: number; tuneId?: number | null; analysed: boolean }>,
  preference: "analysed-fastest" | "fastest",
  preferredTuneId: number | null,
) {
  return [...laps].sort((a, b) => {
    if (preference === "analysed-fastest") {
      const aAnalysed = a.analysed ? 0 : 1;
      const bAnalysed = b.analysed ? 0 : 1;
      if (aAnalysed !== bAnalysed) return aAnalysed - bAnalysed;
    }
    if (preferredTuneId != null) {
      const aTune = a.tuneId === preferredTuneId ? 0 : 1;
      const bTune = b.tuneId === preferredTuneId ? 0 : 1;
      if (aTune !== bTune) return aTune - bTune;
    }
    if (a.lapTime !== b.lapTime) return a.lapTime - b.lapTime;
    return b.id - a.id;
  });
}

describe("trailbrake reference ranking", () => {
  test("prefers analysed laps before raw faster laps", () => {
    const ranked = rankCandidates(
      [
        { id: 1, lapTime: 90.1, analysed: false },
        { id: 2, lapTime: 91.0, analysed: true },
        { id: 3, lapTime: 90.5, analysed: true },
      ],
      "analysed-fastest",
      null,
    );
    expect(ranked[0]?.id).toBe(3);
  });

  test("fastest preference ignores analysis", () => {
    const ranked = rankCandidates(
      [
        { id: 1, lapTime: 90.1, analysed: false },
        { id: 2, lapTime: 91.0, analysed: true },
      ],
      "fastest",
      null,
    );
    expect(ranked[0]?.id).toBe(1);
  });
});
