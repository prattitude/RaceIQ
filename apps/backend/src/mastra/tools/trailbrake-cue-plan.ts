import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getOrBuildTrailbrakeCuePlan } from "@raceiq/backend-core/trailbrake/cue-plan";

const Input = z.object({
  lapId: z.number().int().positive(),
});

const Output = z.object({
  available: z.boolean(),
  lapId: z.number(),
  readable: z.string(),
  plan: z.unknown().optional(),
  error: z.string().optional(),
});

export const getTrailbrakeCuePlanTool = createTool({
  id: "get_trailbrake_cue_plan",
  description:
    "Fetch the Trailbrake approach cue plan for a lap (brake distances + coaching tips merged from metrics and cached analysis). "
    + "Use when discussing approach calls, brake points, or Trailbrake coaching for this lap.",
  inputSchema: Input,
  outputSchema: Output,
  execute: async ({ lapId }) => {
    try {
      const plan = await getOrBuildTrailbrakeCuePlan(lapId);
      if (!plan || plan.corners.length === 0) {
        return {
          available: false,
          lapId,
          readable: `No Trailbrake cue plan is available for lap ${lapId}.`,
          error: "Cue plan not found",
        };
      }
      const summary = plan.corners
        .slice(0, 8)
        .map((corner) => `${corner.name}: ${corner.callText} — ${corner.tipText}`)
        .join("\n");
      return {
        available: true,
        lapId,
        plan,
        readable: `Trailbrake cue plan (${plan.corners.length} corners${plan.hasAnalysis ? ", with AI analysis" : ""}):\n${summary}`,
      };
    } catch (error) {
      return {
        available: false,
        lapId,
        readable: "Failed to load Trailbrake cue plan.",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
