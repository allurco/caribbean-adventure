/**
 * Playing a fight through a boardgame.io client in tests: each step of the
 * fight pressed in turn, as the table would. Round 1 is the ambush (#346):
 * it opens on the attacker's broadside, with no draw. Every hit lands where
 * it rolls, and the round settles itself as its last volley lands (#380).
 */
import type { CaribbeanState, CombatAction } from "../game/types";

/** A client's state and the combat moves a fight presses. */
export interface FightClient {
  getState(): { G: CaribbeanState } | null;
  /** boardgame.io's moves by name: rollSeamanship, rollDefenderSeamanship, chooseCombatAction(action), rollFleeAttempt, rollCannons, returnFire, and the legacy applyResolution. */
  moves: Record<string, (...args: CombatAction[]) => void>;
}

/** Round 1, the ambush: the attacker's broadside and the answer if any; the round settles itself. */
export function fireTheAmbush(client: FightClient): void {
  client.moves.rollCannons();
  if (client.getState()?.G.combat?.stage === "returnFire") client.moves.returnFire();
}

/** Presses the step the fight waits on, choosing `action` when the draw's winner chooses. */
function pressStep(client: FightClient, action: CombatAction): void {
  const combat = client.getState()?.G.combat;
  if (!combat) return;
  if (combat.stage === "seamanship") client.moves.rollSeamanship();
  else if (combat.stage === "defenderSeamanship") client.moves.rollDefenderSeamanship();
  else if (combat.stage === "chooseAction") client.moves.chooseCombatAction(action);
  else if (combat.stage === "fleeAttempt") client.moves.rollFleeAttempt();
  else if (combat.stage === "cannons") client.moves.rollCannons();
  else if (combat.stage === "returnFire") client.moves.returnFire();
  // Only a fight stored at the resolution before #380 waits on it
  else client.moves.applyResolution();
}

/** Presses each step of one round, until the next round begins or the fight ends. */
export function fightOneRound(client: FightClient, action: CombatAction = "fire", maxSteps = 10): void {
  const round = client.getState()?.G.combat?.round;
  for (let step = 0; step < maxSteps; step++) {
    const combat = client.getState()?.G.combat;
    if (!combat || combat.round !== round) return;
    pressStep(client, action);
  }
  throw new Error(`the round did not end in ${maxSteps} steps`);
}

/**
 * Presses each step of the fight until it ends, choosing `action` whenever
 * the draw's winner chooses (fire by default). At most `maxSteps` steps, so
 * a fight that never ends fails the test rather than hanging it.
 */
export function fightToTheEnd(client: FightClient, action: CombatAction = "fire", maxSteps = 100): void {
  for (let step = 0; step < maxSteps; step++) {
    if (!client.getState()?.G.combat) return;
    pressStep(client, action);
  }
  throw new Error(`the fight did not end in ${maxSteps} steps`);
}
