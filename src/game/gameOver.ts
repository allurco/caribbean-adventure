import { WIN_SCORE, type CaribbeanState } from "./types";
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
 * A seat's glory, the player's and not the ship's: on its ship at sea, or in
 * `G.lostShips` from its captain's death to the next pick (`loseShip` and
 * `replaceCaptain` move it from one to the other, so a seat is never in
 * both). Zero for a seat with neither.
 */
function seatGlory(G: Pick<CaribbeanState, "ships" | "lostShips">, seat: string): number {
  return G.ships[seat]?.score ?? G.lostShips?.[seat]?.score ?? 0;
}

/**
 * The game's end, if it is over: the game's `endIf`, run after every move.
 * A win on glory comes first: glory belongs to the player, so a seat that
 * reaches the winning glory wins whether its captain is afloat, went down in
 * the fight that won it, or the seat is out of the game (#369). The winner is
 * named by its captain afloat, else by its seat. Two seats on the winning
 * glory: the first in `seats` (the play order) wins.
 */
export function gameOverResult(G: Pick<CaribbeanState, "ships" | "lostShips">, seats: readonly string[]): GameOverResult | undefined {
  const winner = seats.find((seat) => seatGlory(G, seat) >= WIN_SCORE);
  if (winner !== undefined) {
    const captainName = G.ships[winner]?.captain?.name ?? seatLabel(winner);
    return { reason: "glory", winner, captainName, score: seatGlory(G, winner) };
  }
  const top = winnerWhenAllOut(G, seats);
  if (top === null) return undefined;
  const score = G.lostShips![top].score;
  const leaders = seats.filter((seat) => G.lostShips![seat].score === score);
  return { reason: "allOut", winner: top, leaders, score };
}
