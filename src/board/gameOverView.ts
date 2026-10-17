import type { GameOverResult } from "../game/gameOver";
import { listNames } from "../game/listNames";
import { seatLabel } from "./seat";

/**
 * What the game-over screen shows (#289): a victory for the captain who won
 * on glory (in words for one who fell in the fight that won it, #369), or,
 * when every seat is out of the game, what happened, naming the players
 * (never their dead captains) and the glory they end with.
 */
export type GameOverView =
  | { kind: "victory"; captainName: string; subtitle: string; score: number }
  | { kind: "allOut"; title: string; message: string; score: number };

/** The victory's words for a captain afloat at the end. */
export const CONQUERED = "has conquered the Caribbean!";
/** The victory's words for a captain who fell in the fight that won it (#369). */
export const FELL_WINNING = "claimed the Caribbean in their final fight, and went down with their ship.";

/**
 * The screen for `result` in a game of `seats` seats, on the board of
 * `viewer`'s seat (its `playerID`; null on the hotseat screen every seat
 * shares, which names every seat "Player n"). A result with no reason
 * (before #289) was a win on glory.
 */
export function gameOverView(result: GameOverResult, seats: number, viewer: string | null): GameOverView {
  if (result.reason !== "allOut") {
    return { kind: "victory", captainName: result.captainName, subtitle: result.fallen ? FELL_WINNING : CONQUERED, score: result.score };
  }
  return { kind: "allOut", title: "All Hands Lost", message: allOutMessage(result, seats, viewer), score: result.score };
}

function allOutMessage(result: Extract<GameOverResult, { reason: "allOut" }>, seats: number, viewer: string | null): string {
  if (seats === 1) return `Your last captain is lost. You end with ${result.score} glory.`;
  const leaders = result.leaders ?? [result.winner];
  const you = viewer !== null && leaders.includes(viewer);
  const names = [...(you ? ["You"] : []), ...leaders.filter((seat) => seat !== viewer).map(seatLabel)];
  const verb = names.length === 1 && !you ? "ends" : "end";
  return `Every captain is lost. ${listNames(names)} ${verb} with the most glory (${result.score}).`;
}
