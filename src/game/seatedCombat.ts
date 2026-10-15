/**
 * The game for seated clients (#113 review): each combat move is refused
 * unless the seat sending it is the one that presses the fight's current
 * step (`combatActor`). Online, every action names its seat, so the
 * attacker can never choose, roll or resolve for the defender.
 *
 * Not applied to the local hotseat game: boardgame.io's seatless client
 * sends every move as the current player (the attacker), and one table
 * presses both sides there.
 */
import { INVALID_MOVE } from "boardgame.io/core";
import type { Game, Move } from "boardgame.io";
import { seatMayActInCombat } from "./combatActor";
import type { CaribbeanSetupData, CaribbeanState } from "./types";

type CaribbeanGame = Game<CaribbeanState, Record<string, unknown>, CaribbeanSetupData>;

function actorOnly(move: Move<CaribbeanState>): Move<CaribbeanState> {
  const run = typeof move === "function" ? move : move.move;
  const guarded: typeof run = (context, ...args) => {
    const { G, playerID } = context;
    if (G.combat && !seatMayActInCombat({ playerID, combat: G.combat })) return INVALID_MOVE;
    return run(context, ...args);
  };
  return typeof move === "function" ? guarded : { ...move, move: guarded };
}

export function withSeatedCombat(game: CaribbeanGame): CaribbeanGame {
  const combat = game.phases?.combat;
  if (!combat?.moves) return game;
  const moves = Object.fromEntries(Object.entries(combat.moves).map(([name, move]) => [name, actorOnly(move)]));
  return { ...game, phases: { ...game.phases, combat: { ...combat, moves } } };
}
