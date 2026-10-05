/**
 * Pick a Trailbrake reference lap for the current car/track identity.
 * Prefers analysed laps, then fastest valid replayable lap.
 */
import { inArray } from "drizzle-orm";
import type { GameId } from "@raceiq/shared/games/ids";
import type {
  TrailbrakeReferenceLap,
  TrailbrakeReferencePreference,
} from "@raceiq/shared/racing/trailbrake/types";
import { db } from "../db/index";
import { lapAnalyses } from "../db/schema";
import { getReviewLaps } from "../db/lap-read-queries";
import { getTuneAssignment } from "../db/tune-queries";

export interface TrailbrakeReferenceQuery {
  gameId: GameId;
  carOrdinal?: number | null;
  trackOrdinal?: number | null;
  carId?: string | null;
  trackId?: string | null;
  excludeSessionId?: number | null;
  preference?: TrailbrakeReferencePreference;
  limit?: number;
}

export async function findTrailbrakeReferenceLap(
  query: TrailbrakeReferenceQuery,
): Promise<TrailbrakeReferenceLap | null> {
  const preference = query.preference ?? "analysed-fastest";
  const limit = Math.max(1, Math.min(query.limit ?? 20, 20));
  const laps = await getReviewLaps(
    query.gameId,
    query.trackOrdinal ?? null,
    query.carOrdinal ?? null,
    limit,
    undefined,
    query.trackId ?? undefined,
    query.carId ?? undefined,
  );

  const candidates = laps.filter((lap) => {
    if (query.excludeSessionId != null && lap.sessionId === query.excludeSessionId) return false;
    if (lap.ownership === "others") return false;
    return true;
  });
  if (candidates.length === 0) return null;

  const ids = candidates.map((lap) => lap.id);
  const analysedRows = ids.length > 0
    ? await db.select({ lapId: lapAnalyses.lapId }).from(lapAnalyses).where(inArray(lapAnalyses.lapId, ids)).all()
    : [];
  const analysed = new Set(analysedRows.map((row) => row.lapId));

  let preferredTuneId: number | null = null;
  if (query.carOrdinal != null && query.trackOrdinal != null) {
    const assignment = await getTuneAssignment(query.gameId, query.carOrdinal, query.trackOrdinal);
    preferredTuneId = assignment?.tuneId ?? null;
  }

  const ranked = [...candidates].sort((a, b) => {
    if (preference === "analysed-fastest") {
      const aAnalysed = analysed.has(a.id) ? 0 : 1;
      const bAnalysed = analysed.has(b.id) ? 0 : 1;
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

  const best = ranked[0];
  if (!best) return null;
  return {
    lapId: best.id,
    sessionId: best.sessionId,
    lapTime: best.lapTime,
    hasAnalysis: analysed.has(best.id),
    tuneId: best.tuneId ?? null,
    gameId: best.gameId ?? query.gameId,
    carOrdinal: best.carOrdinal ?? query.carOrdinal ?? null,
    trackOrdinal: best.trackOrdinal ?? query.trackOrdinal ?? null,
    carId: best.carId != null ? String(best.carId) : query.carId ?? null,
    trackId: best.trackId != null ? String(best.trackId) : query.trackId ?? null,
  };
}
