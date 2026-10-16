/**
 * The aim of a volley on the board (#348), pure: which volley the fight
 * waits on and who aims it, and where a fired volley went, in words.
 */
import { engineAims, volleyShooter } from "../game/combatMoves";
import type { CombatState, VolleyAim } from "../game/types";

/** The volley a fight waits on: who fires it, whether a seat or the engine (an NPC) aims it, and whether it answers the first. */
export interface PendingVolley {
  shooterId: string;
  aimedBy: "seat" | "engine";
  answer: boolean;
}

/** The volley the fight waits on, at the cannons or the answer; null at any other step. */
export function pendingVolley(combat: CombatState): PendingVolley | null {
  if (combat.stage !== "cannons" && combat.stage !== "returnFire") return null;
  const shooterId = volleyShooter(combat);
  return { shooterId, aimedBy: engineAims(combat, shooterId) ? "engine" : "seat", answer: combat.stage === "returnFire" };
}

/** Each aim's name on the aim buttons. */
export const AIM_LABELS: Record<VolleyAim, string> = { hull: "Hull", masts: "Masts", crew: "Crew" };

/** Where a fired volley went: "at the masts". A volley fired before aiming (no aim) went to the hull. */
export function aimedAt(aim: VolleyAim | undefined): string {
  return `at the ${aim ?? "hull"}`;
}
