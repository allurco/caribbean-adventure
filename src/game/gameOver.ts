import type { CaribbeanState, LostShip, ShipState } from "./types";
import { findWinner } from "./scoring";
import { winnerWhenAllOut } from "./captainDeath";
import { seatLabel } from "./seats";

/**
 * How the game ended (#289), boardgame.io's `ctx.gameover`: won on glory by
 * a captain who reached the winning glory, or every seat out of the game
 * (#265), the most glory ending on top with no captain left to name.
 * `leaders` are every seat tied on that glory, in seat order, `winner` the
 * first of them. A glory win is `fallen` when the captain went down in the
 * fight that won it (#369). JSON, as `ctx.gameover` must be.
 */
export type GameOverResult =
  | { reason: "glory"; winner: string; captainName: string; score: number; fallen?: true }
  | { reason: "allOut"; winner: string; leaders: string[]; score: number };

/**
 * Each seat's glory, wherever it is held: on its ship at sea, or in
 * `G.lostShips` from its captain's death to the next pick (`loseShip` and
 * `replaceCaptain` move a seat from one to the other, so it is never in
 * both).
 */
function seatGlory(G: Pick<CaribbeanState, "ships" | "lostShips">): Record<string, LostShip | ShipState> {
  return { ...G.lostShips, ...G.ships };
}

/**
 * The game's end, if it is over: the game's `endIf`, run after every move.
 * A win on glory comes first, and counts every seat's glory (`seatGlory`):
 * a captain who reaches the winning glory in the fight that sinks them wins
 * on the move that settles it (#369), the fallen captain named. An out
 * seat's glory otherwise ends the game only in the all-out ending.
 */
export function gameOverResult(G: Pick<CaribbeanState, "ships" | "lostShips">, seats: readonly string[]): GameOverResult | undefined {
  const winner = findWinner(seatGlory(G));
  if (winner !== null) {
    const afloat = G.ships[winner];
    const holder = afloat ?? G.lostShips![winner];
    const captainName = holder.captain?.name ?? seatLabel(winner);
    return { reason: "glory", winner, captainName, score: holder.score, ...(afloat ? {} : { fallen: true as const }) };
  }
  const top = winnerWhenAllOut(G, seats);
  if (top === null) return undefined;
  const score = G.lostShips![top].score;
  const leaders = seats.filter((seat) => G.lostShips![seat].score === score);
  return { reason: "allOut", winner: top, leaders, score };
}
