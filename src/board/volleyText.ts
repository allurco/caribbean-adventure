/**
 * A fight's volleys on the board, pure (#348, #380): which volley the fight
 * waits on, a fired volley in words (its hits and where each landed), the
 * settled round the panel still shows, and how a fight ended.
 */
import { isVolleyStage, sameFight, volleyShooter } from "../game/combatMoves";
import { fleePenalty, hitCountsOf } from "../game/combat";
import { seatLabel } from "../game/seats";
import { boardingOutcomeLines } from "./boardingText";
import type { CombatState, SettledRound, Volley } from "../game/types";

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
 * added ("2 hits: 1 hull, 1 mast +1 chain shot"), both as recorded when it
 * was fired; "mast" takes its plural, "hull" and "crew" never do. Mast hits past the cap say they went to the hull ("3 masts
 * (to hull, masts gone)", or "(1 to hull, masts gone)" for some of them).
 */
export function volleyLine(volley: Volley): { fired: string; hits: string } {
  const fired = `fired ${volley.guns} gun${volley.guns === 1 ? "" : "s"}`;
  if (volley.hits === 0) return { fired, hits: "no hits" };
  const at = hitCountsOf(volley);
  const shots = volley.shotBonuses ?? [];
  const chain = shots.includes("chain_shot");
  const grape = shots.includes("grape_shot");
  const onMasts = at.masts + (chain ? 1 : 0);
  const overflow = volley.dealt ? onMasts - volley.dealt.masts : 0;
  const parts: string[] = [];
  if (at.hull > 0) parts.push(`${at.hull} hull`);
  if (at.masts > 0) {
    const toHull = overflow <= 0 ? "" : overflow >= onMasts ? " (to hull, masts gone)" : ` (${overflow} to hull, masts gone)`;
    parts.push(`${at.masts} ${at.masts === 1 ? "mast" : "masts"}${chain ? ` +1 ${SHOT_NAMES.chain_shot}` : ""}${toHull}`);
  }
  if (at.crew > 0) parts.push(`${at.crew} crew${grape ? ` +1 ${SHOT_NAMES.grape_shot}` : ""}`);
  return { fired, hits: `${volley.hits} hit${volley.hits === 1 ? "" : "s"}: ${parts.join(", ")}` };
}

/**
 * Whether a round's volleys show "No answer" (#346): one volley fired, and
 * the round was not a caught flight (whose parting shot is never answered).
 */
export function noAnswer(volleys: readonly Volley[], fleeOutcome: SettledRound["fleeOutcome"]): boolean {
  return volleys.length === 1 && fleeOutcome !== "caught";
}

/**
 * Who a fight's ship is, on its panels: the NPC by its kind when it is the
 * defender of an NPC fight ("Merchant"), else its seat ("Player 2").
 */
export function combatantLabel(fight: Pick<SettledRound, "defenderId" | "isNPCCombat">, id: string, npcLabel: string | null): string {
  return fight.isNPCCombat && id === fight.defenderId ? (npcLabel ?? "NPC") : seatLabel(id);
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
  if (!settled || !sameFight(settled, combat)) return null;
  if (settled.round !== combat.round - 1 || (combat.volleys ?? []).length > 0) return null;
  return settled;
}

/**
 * How a fight ended, under the volleys of its last round (#380): the ships
 * it sank or left derelict (one derelict before the round is not news), a
 * boarding's end (#350: who struck, what the winner took), or a caught
 * flight's end. `nameOf` names a ship by its id.
 */
export function fightOverLines(settled: SettledRound, nameOf: (id: string) => string): string[] {
  if (settled.boarding) return boardingOutcomeLines(settled.boarding, nameOf);
  const lines = [
    ...(settled.sunk ?? []).map((id) => `${nameOf(id)} is sunk`),
    ...(settled.leftDerelict ?? []).map((id) => `${nameOf(id)} is left derelict`),
  ];
  if (lines.length === 0 && settled.fleeOutcome === "caught") {
    lines.push(settled.volleys.length > 0 ? "The parting shot ends the chase" : "Caught, but out of the pursuer's range: no parting shot");
  }
  return lines;
}

/**
 * The draw's dice in words (#347): each side's die plus its ship's
 * manoeuvrability, and the total the draw compares ("Rolls: P1: 4 + 2 = 6 |
 * NPC: 5 + 0 = 5"), as the pursuit line shows its sums. A side yet to roll
 * is left out.
 */
export function drawRollsLine(sides: readonly { label: string; die: number | undefined; maneuverability: number }[]): string {
  type Rolled = { label: string; die: number; maneuverability: number };
  const rolled = sides.filter((side): side is Rolled => side.die !== undefined);
  return `Rolls: ${rolled.map(({ label, die, maneuverability }) => `${label}: ${die} + ${maneuverability} = ${die + maneuverability}`).join(" | ")}`;
}

/** The flight's dice (#348): the fleeing ship's die less what its masts cost it, when they cost it anything. */
export function pursuitRollsLine(rolls: { pursuer: number; fleeer: number }, fleeerMastDamage: number): string {
  const penalty = fleePenalty(fleeerMastDamage);
  const fleeer = penalty > 0 ? `${rolls.fleeer} − ${penalty} ${penalty === 1 ? "mast" : "masts"} = ${rolls.fleeer - penalty}` : `${rolls.fleeer}`;
  return `Pursuit rolls: Pursuer ${rolls.pursuer} | Fleeer ${fleeer}`;
}
