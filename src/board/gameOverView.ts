import type { GameOverResult } from "../game/gameOver";
import { seatLabel } from "./seat";

/**
 * What the game-over screen shows (#289): a victory for the captain who won
 * on glory, or, when every seat is out of the game, what happened, naming
 * the player (never their dead captain) and the glory they end with.
 */
export type GameOverView =
  | { kind: "victory"; captainName: string; score: number }
  | { kind: "allOut"; title: string; message: string; score: number };

/** The screen for `result` in a game of `seats` seats. A result with no reason (before #289) was a win on glory. */
export function gameOverView(result: GameOverResult, seats: number): GameOverView {
  if (result.reason !== "allOut") return { kind: "victory", captainName: result.captainName, score: result.score };
  const message =
    seats === 1
      ? `Your last captain is lost. You end with ${result.score} glory.`
      : `Every captain is lost. ${seatLabel(result.winner)} ends with the most glory (${result.score}).`;
  return { kind: "allOut", title: "All Hands Lost", message, score: result.score };
}
