import { describe, it, expect } from "vitest";
import { gameOverView } from "./gameOverView";

/** What the game-over screen says (#289): a victory only when it was won on glory. */
describe("gameOverView", () => {
  it("a win on glory is a victory for the captain who won it", () => {
    expect(gameOverView({ reason: "glory", winner: "1", captainName: "Drake", score: 20 }, 2)).toEqual({
      kind: "victory",
      captainName: "Drake",
      score: 20,
    });
  });

  it("every seat out: names the player with the most glory, never a captain", () => {
    expect(gameOverView({ reason: "allOut", winner: "1", score: 4 }, 3)).toEqual({
      kind: "allOut",
      title: "All Hands Lost",
      message: "Every captain is lost. Player 2 ends with the most glory (4).",
      score: 4,
    });
  });

  it("solo, out of captains: no victory, the glory you end with", () => {
    expect(gameOverView({ reason: "allOut", winner: "0", score: 4 }, 1)).toEqual({
      kind: "allOut",
      title: "All Hands Lost",
      message: "Your last captain is lost. You end with 4 glory.",
      score: 4,
    });
  });
});
