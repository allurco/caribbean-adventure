/**
 * A fight's volleys on the board, pure (#348, #380): which volley the fight
 * waits on, a fired volley in words (its hits and where each landed), the
 * settled round the panel still shows, and how a fight ended.
 */
import { volleyShooter, isVolleyStage } from "../game/combatMoves";
import { fleePenalty, hitCountsOf, shotBonuses } from "../game/combat";
import type { CaribbeanState, CombatState, SettledRound, Volley } from "../game/types";
import { HIT_LOCATIONS } from "../game/types";

/** The volley a fight waits on: who fires it. */
export interface PendingVolley {
  shooterId: string;
}

/** The volley the fight waits on, at the cannons or the answer; null at any other step. */
export function pendingVolley(combat: CombatState): PendingVolley | null {
  if (!isVolleyStage(combat.stage)) return null;
  return { shooterId: volleyShooter(combat) };
}

/** The shots' names on a volley line. */
const SHOT_NAMES = { chain_shot: "chain shot", grape_shot: "grape shot" } as const;

/**
 * A fired volley in words, after its shooter's name: the guns it fired
 * ("fired 3 guns"), and its hits by where each landed, with what its shot
 * added ("2 hits: 1 hull, 1 masts +1 chain shot"). `shooterUpgrades` are
 * the firing ship's.
 */
export function volleyLine(volley: Volley, shooterUpgrades: readonly string[]): { fired: string; hits: string } {
  const fired = `fired ${volley.guns} gun${volley.guns === 1 ? "" : "s"}`;
  if (volley.hits === 0) return { fired, hits: "no hits" };
  const at = hitCountsOf(volley);
  const where = HIT_LOCATIONS.filter((location) => at[location] > 0).map((location) => `${at[location]} ${location}`);
  const shots = shotBonuses(at, shooterUpgrades).map((shot) => ` +1 ${SHOT_NAMES[shot]}`);
  return { fired, hits: `${volley.hits} hit${volley.hits === 1 ? "" : "s"}: ${where.join(", ")}${shots.join("")}` };
}

/** The line over the answer's Fire!: who answers the volley it took. */
export function answerLine(answering: string): string {
  return `${answering} answers the broadside`;
}

/**
 * The settled round the fight's panel still shows (#380): the round before
 * this one of the same fight, until this round fires its first volley. The
 * round settles itself as its last volley lands, so this is where its
 * volleys stay readable. Null otherwise.
 */
export function roundShown(combat: CombatState, settled: SettledRound | undefined): SettledRound | null {
  if (!settled || settled.attackerId !== combat.attackerId || settled.defenderId !== combat.defenderId) return null;
  if (settled.round !== combat.round - 1 || (combat.volleys ?? []).length > 0) return null;
  return settled;
}

/**
 * How a fight ended, under the volleys of its last round (#380): a ship
 * sunk (gone from G) or left derelict, or a caught flight's end. `nameOf`
 * names a ship by its id.
 */
export function fightOverLines(G: Pick<CaribbeanState, "ships" | "npcs">, settled: SettledRound, nameOf: (id: string) => string): string[] {
  const lines: string[] = [];
  for (const id of [settled.attackerId, settled.defenderId]) {
    const ship = settled.isNPCCombat && id === settled.defenderId ? G.npcs[id] : G.ships[id];
    if (!ship) lines.push(`${nameOf(id)} is sunk`);
    else if (ship.isDerelict) lines.push(`${nameOf(id)} is left derelict`);
  }
  if (lines.length === 0 && settled.fleeOutcome === "caught") {
    lines.push(settled.volleys.length > 0 ? "The parting shot ends the chase" : "Caught, but out of the pursuer's range: no parting shot");
  }
  return lines;
}

/** The flight's dice (#348): the fleeing ship's die less what its masts cost it, when they cost it anything. */
export function pursuitRollsLine(rolls: { pursuer: number; fleeer: number }, fleeerMastDamage: number): string {
  const penalty = fleePenalty(fleeerMastDamage);
  const fleeer = penalty > 0 ? `${rolls.fleeer} − ${penalty} masts = ${rolls.fleeer - penalty}` : `${rolls.fleeer}`;
  return `Pursuit rolls: Pursuer ${rolls.pursuer} | Fleeer ${fleeer}`;
}
