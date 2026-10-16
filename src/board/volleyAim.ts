/**
 * The aim of a volley on the board (#348), pure: which volley the fight
 * waits on and who aims it, and a fired volley in words.
 */
import { engineAims, isVolleyStage, volleyShooter } from "../game/combatMoves";
import { fleePenalty, shotBonus } from "../game/combat";
import type { CombatState, Volley, VolleyAim } from "../game/types";

/** The volley a fight waits on: who fires it, and whether a seat or the engine (an NPC) aims it. */
export interface PendingVolley {
  shooterId: string;
  aimedBy: "seat" | "engine";
}

/** The volley the fight waits on, at the cannons or the answer; null at any other step. */
export function pendingVolley(combat: CombatState): PendingVolley | null {
  if (!isVolleyStage(combat.stage)) return null;
  const shooterId = volleyShooter(combat);
  return { shooterId, aimedBy: engineAims(combat, shooterId) ? "engine" : "seat" };
}

/** Each aim's name on the aim buttons. */
export const AIM_LABELS: Record<VolleyAim, string> = { hull: "Hull", masts: "Masts", crew: "Crew" };

/** Where a fired volley went: "at the masts". A volley fired before aiming (no aim) went to the hull. */
export function aimedAt(aim: VolleyAim | undefined): string {
  return `at the ${aim ?? "hull"}`;
}

/** The shots' names on a volley line. */
const SHOT_NAMES = { chain_shot: "chain shot", grape_shot: "grape shot" } as const;

/**
 * A fired volley in words, after its shooter's name: what it fired where
 * ("fired 3 guns at the masts"), and its hits, with the hit its shot added
 * ("2 hits +1 chain shot"). `shooterUpgrades` are the firing ship's.
 */
export function volleyLine(volley: Volley, shooterUpgrades: readonly string[]): { fired: string; hits: string } {
  const aim = volley.aim ?? "hull";
  const shot = shotBonus(volley.hits, aim, shooterUpgrades);
  return {
    fired: `fired ${volley.guns} gun${volley.guns === 1 ? "" : "s"} ${aimedAt(volley.aim)}`,
    hits: `${volley.hits} hit${volley.hits === 1 ? "" : "s"}${shot ? ` +1 ${SHOT_NAMES[shot]}` : ""}`,
  };
}

/** The line over the answer's aim: who answers the volley it took. */
export function answerLine(answering: string): string {
  return `${answering} answers the broadside`;
}

/** The flight's dice (#348): the fleeing ship's die less what its masts cost it, when they cost it anything. */
export function pursuitRollsLine(rolls: { pursuer: number; fleeer: number }, fleeerMastDamage: number): string {
  const penalty = fleePenalty(fleeerMastDamage);
  const fleeer = penalty > 0 ? `${rolls.fleeer} − ${penalty} masts = ${rolls.fleeer - penalty}` : `${rolls.fleeer}`;
  return `Pursuit rolls: Pursuer ${rolls.pursuer} | Fleeer ${fleeer}`;
}
