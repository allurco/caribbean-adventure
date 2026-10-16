/**
 * Who presses each step of a fight (#245): the one rule the board's seat
 * views, the combat moves and the `/api` move check (#113) all read. Pure.
 */
import type { CombatState } from "./types";

/** Who fights whom: the sides of a fight, as the seat rules read them. */
export type FightSides = Pick<CombatState, "attackerId" | "defenderId" | "isNPCCombat">;

/**
 * What says whose step it is: the step, the attacker, the draw's winner (the
 * faster ship), whether the foe is an NPC, and whether a flight was caught.
 * And the defender, read only when it is a seat: null may stand for an NPC,
 * whose id the voyage list never sends.
 */
export type FightTurn = Pick<CombatState, "stage" | "attackerId" | "seamanshipWinner" | "isNPCCombat" | "fleeOutcome"> & {
  defenderId: string | null;
};

/** A fight's sides and the step it is on. */
export type FightStep = FightSides & FightTurn;

/** The client's seat (null or undefined in hotseat) and the fight on. */
export interface SeatFight {
  playerID?: string | null;
  combat: FightStep;
}

/**
 * The seat that presses the fight's current step. A fight is a declaration,
 * then round 1, the ambush (#346): no draw, and the attacker fires and ends
 * the round. Each later round is a draw (the seamanship roll) that decides
 * the faster ship, then its action (fire, board or flee) and the rolls after
 * it. Each captain rolls its own die of the draw (#347), the attacker first,
 * then the defender; the faster ship presses the rest, but for a flight that
 * was caught: the pursuer fires the parting shot and settles the round, not
 * the ship it fires on. Each volley is aimed by the ship firing it (#348):
 * the answer to the first is the other side's step. Against an NPC the attacker presses every step: its
 * one roll throws the NPC's die too, and when the NPC wins the draw the
 * engine picks its action.
 */
export function combatActor(combat: FightTurn): string {
  if (combat.stage === "seamanship" || combat.isNPCCombat) return combat.attackerId;
  if (combat.stage === "defenderSeamanship") return combat.defenderId ?? combat.attackerId;
  const faster = combat.seamanshipWinner ?? combat.attackerId;
  const other = faster === combat.attackerId ? (combat.defenderId ?? combat.attackerId) : combat.attackerId;
  if (combat.stage === "returnFire") return other;
  const partingShot = combat.fleeOutcome === "caught" && (combat.stage === "cannons" || combat.stage === "resolution");
  if (!partingShot) return faster;
  return other;
}

/**
 * May this seat press the fight's current step? A seatless client (the
 * hotseat table, `playerID` undefined or null) always; else only the seat
 * whose step it is. The combat moves refuse everyone else, so online one
 * seat can never press another's step.
 */
export function seatMayActInCombat({ playerID, combat }: SeatFight): boolean {
  return playerID == null || playerID === combatActor(combat);
}
