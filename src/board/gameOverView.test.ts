import { describe, it, expect } from "vitest";
import { gameOverView } from "./gameOverView";
import type { GameOverResult } from "../game/gameOver";

/**
 * What the game-over screen says (#289): a victory only when it was won on
 * glory. `viewer` is the board's seat (`playerID`), null on the hotseat
 * screen every seat shares.
 */
describe("gameOverView", () => {
  const allOut = (leaders: string[], score: number): GameOverResult => ({ reason: "allOut", winner: leaders[0], leaders, score });

  it("a win on glory is a victory for the captain who won it", () => {
    expect(gameOverView({ reason: "glory", winner: "1", captainName: "Drake", score: 20 }, 2, null)).toEqual({
      kind: "victory",
      captainName: "Drake",
      subtitle: "has conquered the Caribbean!",
      score: 20,
    });
  });

  it("a captain who fell in the fight that won it is named, with words for a win after death (#369)", () => {
    expect(gameOverView({ reason: "glory", winner: "0", captainName: "Blackbeard", score: 10, fallen: true }, 2, null)).toEqual({
      kind: "victory",
      captainName: "Blackbeard",
      subtitle: "won the Caribbean in their last fight, and went down with their ship.",
      score: 10,
    });
  });

  it("a result from before #289, with no reason, is the victory it used to show", () => {
    const old = { winner: "0", captainName: "Drake", score: 20 } as unknown as GameOverResult;
    expect(gameOverView(old, 2, null)).toEqual({ kind: "victory", captainName: "Drake", subtitle: "has conquered the Caribbean!", score: 20 });
  });

  it("every seat out: names the player with the most glory, never a captain", () => {
    expect(gameOverView(allOut(["1"], 4), 3, null)).toEqual({
      kind: "allOut",
      title: "All Hands Lost",
      message: "Every captain is lost. Player 2 ends with the most glory (4).",
      score: 4,
    });
  });

  it("a tie for the most glory names every seat tied on it", () => {
    expect(gameOverView(allOut(["0", "2"], 4), 3, null)).toMatchObject({
      message: "Every captain is lost. Player 1 and Player 3 end with the most glory (4).",
    });
  });

  it("on your own seat's board, you are 'you'", () => {
    expect(gameOverView(allOut(["1"], 4), 2, "1")).toMatchObject({
      message: "Every captain is lost. You end with the most glory (4).",
    });
    expect(gameOverView(allOut(["0", "1"], 4), 2, "1")).toMatchObject({
      message: "Every captain is lost. You and Player 1 end with the most glory (4).",
    });
  });

  it("on another seat's board, the leader is still 'Player n'", () => {
    expect(gameOverView(allOut(["1"], 4), 2, "0")).toMatchObject({
      message: "Every captain is lost. Player 2 ends with the most glory (4).",
    });
  });

  it("solo, out of captains: no victory, the glory you end with", () => {
    expect(gameOverView(allOut(["0"], 4), 1, null)).toEqual({
      kind: "allOut",
      title: "All Hands Lost",
      message: "Your last captain is lost. You end with 4 glory.",
      score: 4,
    });
  });
});
