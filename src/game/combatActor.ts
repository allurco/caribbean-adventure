/**
 * Who presses each step of a fight (#245): the one rule the board's seat
 * views, the combat moves and the `/api` move check (#113) all read. Pure.
 */
import type { CombatState } from "./types";

/** Who fights whom: the sides of a fight, as the seat rules read them. */
export type FightSides = Pick<CombatState, "attackerId" | "defenderId" | "isNPCCombat">;

/** A fight's sides and the step it is on: the draw's winner is the faster ship. */
export type FightStep = FightSides & Pick<CombatState, "stage" | "seamanshipWinner">;

/** The client's seat (null or undefined in hotseat) and the fight on. */
export interface SeatFight {
  playerID?: string | null;
  combat: FightStep;
}

/**
 * The seat that presses the fight's current step. A fight is a declaration,
 * a draw (the seamanship roll, both dice) that decides the faster ship, then
 * its action (fire, board or flee) and the rolls after it. The attacker rolls
 * the draw; the faster ship presses the rest. Against an NPC the attacker
 * presses every step: when the NPC wins the draw the engine picks its action.
 */
export function combatActor(combat: FightStep): string {
  if (combat.stage === "seamanship" || combat.isNPCCombat) return combat.attackerId;
  return combat.seamanshipWinner ?? combat.attackerId;
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
