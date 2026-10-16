import type { CaribbeanState } from "./types";
import { findWinner } from "./scoring";
import { winnerWhenAllOut } from "./captainDeath";
import { seatLabel } from "./seats";

/**
 * How the game ended (#289), boardgame.io's `ctx.gameover`: won on glory by
 * a captain who reached the winning glory, or every seat out of the game
 * (#265), the most glory ending on top with no captain left to name.
 * `leaders` are every seat tied on that glory, in seat order, `winner` the
 * first of them. JSON, as `ctx.gameover` must be.
 */
export type GameOverResult =
  | { reason: "glory"; winner: string; captainName: string; score: number }
  | { reason: "allOut"; winner: string; leaders: string[]; score: number };

/**
 * The game's end, if it is over: the game's `endIf`. A win on glory comes
 * first. It looks only at ships at sea: `endIf` runs after every move, so a
 * seat that reached the winning glory afloat has already won, and an out
 * seat's glory is read only for the all-out ending.
 */
export function gameOverResult(G: Pick<CaribbeanState, "ships" | "lostShips">, seats: readonly string[]): GameOverResult | undefined {
  const winner = findWinner(G.ships);
  if (winner !== null) {
    const ship = G.ships[winner];
    return { reason: "glory", winner, captainName: ship.captain?.name ?? seatLabel(winner), score: ship.score };
  }
  const top = winnerWhenAllOut(G, seats);
  if (top === null) return undefined;
  const score = G.lostShips![top].score;
  const leaders = seats.filter((seat) => G.lostShips![seat].score === score);
  return { reason: "allOut", winner: top, leaders, score };
}
