import type { CaribbeanState } from "./types";
import { moveFlotillas, moveMerchants } from "./npcManager";
import { drawEvent, type DrawnAt } from "./eventDeck";
import { isEliminated } from "./captainDeath";

/** The turn that ended: whose and which (`drawEvent`), and whether it was the round's last seat's. */
export interface TurnEnded extends DrawnAt {
  endsRound: boolean;
}

/**
 * The world's step as a main-phase turn ends: the flotillas sail; the
 * merchants sail too, but only as the round ends, after the last seat's
 * turn, so the world's pace does not hang on how many seats play (#246); and
 * one event card is drawn (`drawEvent`). Merchants put to sea only through
 * the Merchant convoy card. A seat out of the game (#265) plays no turn: the
 * one that passes as it goes out draws no card, though it may still end the
 * round.
 *
 * A turn that ends in a fight (#284) takes its step when the fight resolves,
 * not as it starts (#288): while `G.combat` is set the world holds still, so
 * each turn steps it, and draws, exactly once whichever way it ends. Run by
 * both the main and the combat phase's turn `onEnd`.
 */
export function npcTurnEndStep(G: CaribbeanState, randomNumber: () => number, turn: TurnEnded): void {
  if (G.combat) return;
  moveFlotillas(G);
  if (turn.endsRound) moveMerchants(G);
  if (!isEliminated(G, turn.seat)) drawEvent(G, randomNumber, turn);
}

/**
 * Whether the seat at `playOrderPos` is the round's last: the next seat
 * still in the game comes round to the start of the play order again
 * (`nextPos` from the turn order's `seatStillIn`). Solo, every turn is.
 */
export function endsRound(playOrderPos: number, nextPos: number): boolean {
  return nextPos <= playOrderPos;
}
