import type { CaribbeanState } from "./types";
import { findWinner } from "./scoring";
import { winnerWhenAllOut } from "./captainDeath";

/**
 * How the game ended (#289), boardgame.io's `ctx.gameover`: won on glory by
 * a captain who reached the winning glory, or every seat out of the game
 * (#265), the most glory ending on top with no captain left to name.
 * JSON, as `ctx.gameover` must be.
 */
export type GameOverResult =
  | { reason: "glory"; winner: string; captainName: string; score: number }
  | { reason: "allOut"; winner: string; score: number };

/** The game's end, if it is over: the game's `endIf`. A win on glory comes first. */
export function gameOverResult(G: Pick<CaribbeanState, "ships" | "lostShips">, seats: readonly string[]): GameOverResult | undefined {
  const winner = findWinner(G.ships);
  if (winner !== null) {
    const ship = G.ships[winner];
    return { reason: "glory", winner, captainName: ship.captain?.name ?? `Player ${Number(winner) + 1}`, score: ship.score };
  }
  const top = winnerWhenAllOut(G, seats);
  if (top !== null) return { reason: "allOut", winner: top, score: G.lostShips![top].score };
  return undefined;
}
