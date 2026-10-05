/**
 * Build Trailbrake cue plans from deterministic lap metrics + cached AI analysis.
 * Timing comes from segment stats; speakable text prefers analyst corner fixes.
 */
import type { LapInsight } from "@raceiq/analysis-core/racing/analysis/laps/insights/types";
import type {
  TrailbrakeCornerCue,
  TrailbrakeCuePlan,
  TrailbrakeSeverity,
} from "@raceiq/shared/racing/trailbrake/types";
import { getAnalysis } from "../db/analysis-queries";
import {
  deleteTrailbrakeCuePlan,
  getTrailbrakeCuePlanRow,
  saveTrailbrakeCuePlan,
} from "../db/trailbrake-cue-plan-queries";
import { parseAnalystOutput } from "../ai/schemas";
import { getOrComputeLapMetrics } from "../lap-analysis/metrics-store";
import type { SegmentStat } from "../lap-analysis/metrics";

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function labelsMatch(a: string, b: string): boolean {
  const left = normalizeLabel(a);
  const right = normalizeLabel(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function severityFromInsight(insights: LapInsight[], segmentName: string): TrailbrakeSeverity {
  const hit = insights.find((insight) =>
    (insight.id.includes("brake") || insight.id.includes("trail"))
    && (labelsMatch(insight.label, segmentName) || insight.detail.toLowerCase().includes(normalizeLabel(segmentName))),
  );
  if (!hit) return "info";
  if (hit.severity === "critical") return "major";
  if (hit.severity === "warning") return "moderate";
  return "minor";
}

function severityFromAnalyst(severity: "minor" | "moderate" | "major" | undefined): TrailbrakeSeverity {
  return severity ?? "info";
}

function formatCall(name: string): string {
  return `Brake ${name}`;
}

function formatTipFromStats(segment: SegmentStat): string {
  const on = segment.stats.brakeOnDist;
  if (on == null) return `Approach ${segment.name} — watch brake release.`;
  return `Brake near ${Math.round(on)} m into the lap at ${segment.name}.`;
}

export function mergeCuePlanFromParts(
  lapId: number,
  segmentStats: SegmentStat[],
  insights: LapInsight[],
  analysisJson: string | null,
  sourceAnalysisAt: string | null,
): TrailbrakeCuePlan {
  const cornersOnly = segmentStats.filter((segment) => segment.type === "corner");
  const parsed = analysisJson ? parseAnalystOutput(analysisJson) : null;
  const analystCorners = parsed?.success ? parsed.data.corners : [];
  const analystBraking = parsed?.success ? (parsed.data.braking ?? []) : [];

  let trackLengthM: number | null = null;
  for (const segment of segmentStats) {
    const endGuess = segment.stats.brakeOffDist ?? segment.stats.peakBrakeDist ?? segment.stats.brakeOnDist;
    if (endGuess != null) trackLengthM = Math.max(trackLengthM ?? 0, endGuess);
    if (segment.endFrac > 0 && segment.endFrac <= 1 && endGuess != null && segment.endFrac > 0.9) {
      trackLengthM = Math.max(trackLengthM ?? 0, endGuess / segment.endFrac);
    }
  }

  const corners: TrailbrakeCornerCue[] = cornersOnly.map((segment) => {
    const analyst = analystCorners.find((item) => labelsMatch(item.name, segment.name));
    const braking = analystBraking.find((item) => labelsMatch(item.corner, segment.name));
    const tipText = analyst?.fix
      || braking?.detail
      || insights.find((insight) => labelsMatch(insight.label, segment.name))?.detail
      || formatTipFromStats(segment);
    const severity = analyst
      ? severityFromAnalyst(analyst.severity)
      : severityFromInsight(insights, segment.name);
    const brakeOn = segment.stats.brakeOnDist;
    const peak = segment.stats.peakBrakeDist;
    const brakeOff = segment.stats.brakeOffDist;
    const trailStart =
      peak != null && brakeOn != null && peak > brakeOn
        ? brakeOn + (peak - brakeOn) * 0.45
        : peak;
    const throttleOn =
      segment.stats.fullThrottleDist
      ?? (brakeOff != null ? brakeOff + 8 : null);
    return {
      name: segment.name,
      startFrac: segment.startFrac,
      endFrac: segment.endFrac,
      brakeOnDist: brakeOn,
      peakBrakeDist: peak,
      brakeOffDist: brakeOff,
      trailStartDist: trailStart,
      throttleOnDist: throttleOn,
      severity,
      callText: formatCall(segment.name),
      tipText: tipText.slice(0, 160),
    };
  });

  return {
    lapId,
    trackLengthM,
    hasAnalysis: Boolean(parsed?.success),
    corners,
    builtAt: new Date().toISOString(),
    sourceAnalysisAt,
  };
}

/** Build (or rebuild) and persist a cue plan for a lap. */
export async function buildAndSaveTrailbrakeCuePlan(lapId: number): Promise<TrailbrakeCuePlan | null> {
  const metrics = await getOrComputeLapMetrics(lapId);
  if (!metrics) return null;
  const analysisRow = await getAnalysis(lapId);
  const plan = mergeCuePlanFromParts(
    lapId,
    metrics.segmentStats,
    metrics.insights,
    analysisRow?.analysis ?? null,
    analysisRow ? new Date().toISOString() : null,
  );
  await saveTrailbrakeCuePlan(lapId, plan, plan.sourceAnalysisAt);
  return plan;
}

/** Return cached plan or build on demand. */
export async function getOrBuildTrailbrakeCuePlan(lapId: number): Promise<TrailbrakeCuePlan | null> {
  const cached = await getTrailbrakeCuePlanRow(lapId);
  if (cached) return cached.plan;
  return buildAndSaveTrailbrakeCuePlan(lapId);
}

export async function clearTrailbrakeCuePlan(lapId: number): Promise<void> {
  await deleteTrailbrakeCuePlan(lapId);
}
