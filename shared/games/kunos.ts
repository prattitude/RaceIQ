import type { GameId } from "./ids";

/**
 * Kunos shared-memory sources. They share the acpmf-derived packet shape
 * (`packet.acc`), acquisition-time timestamps, and packed-triplet captures.
 */
export const KUNOS_GAME_IDS = ["acc", "ac-evo", "ac"] as const satisfies readonly GameId[];

export type KunosGameId = (typeof KUNOS_GAME_IDS)[number];

export function isKunosGameId(gameId: string | null | undefined): gameId is KunosGameId {
  return gameId === "acc" || gameId === "ac-evo" || gameId === "ac";
}
