import { eq } from "drizzle-orm";
import { db } from "./index";
import { trailbrakeCuePlans } from "./schema";
import type { TrailbrakeCuePlan } from "@raceiq/shared/racing/trailbrake/types";

export async function getTrailbrakeCuePlanRow(lapId: number): Promise<{
  plan: TrailbrakeCuePlan;
  builtAt: string;
  sourceAnalysisAt: string | null;
} | null> {
  const row = await db
    .select({
      plan: trailbrakeCuePlans.plan,
      builtAt: trailbrakeCuePlans.builtAt,
      sourceAnalysisAt: trailbrakeCuePlans.sourceAnalysisAt,
    })
    .from(trailbrakeCuePlans)
    .where(eq(trailbrakeCuePlans.lapId, lapId))
    .get();
  if (!row) return null;
  try {
    const plan = JSON.parse(row.plan) as TrailbrakeCuePlan;
    return { plan, builtAt: row.builtAt, sourceAnalysisAt: row.sourceAnalysisAt };
  } catch {
    return null;
  }
}

export async function saveTrailbrakeCuePlan(
  lapId: number,
  plan: TrailbrakeCuePlan,
  sourceAnalysisAt: string | null,
): Promise<void> {
  const values = {
    plan: JSON.stringify(plan),
    builtAt: plan.builtAt,
    sourceAnalysisAt,
  };
  const existing = await db
    .select({ lapId: trailbrakeCuePlans.lapId })
    .from(trailbrakeCuePlans)
    .where(eq(trailbrakeCuePlans.lapId, lapId))
    .get();
  if (existing) {
    await db.update(trailbrakeCuePlans).set(values).where(eq(trailbrakeCuePlans.lapId, lapId)).run();
  } else {
    await db.insert(trailbrakeCuePlans).values({ lapId, ...values }).run();
  }
}

export async function deleteTrailbrakeCuePlan(lapId: number): Promise<void> {
  await db.delete(trailbrakeCuePlans).where(eq(trailbrakeCuePlans.lapId, lapId)).run();
}
