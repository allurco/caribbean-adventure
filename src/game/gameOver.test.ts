import { describe, it, expect } from "vitest";
import { createShipState } from "./economy";
import { hex } from "./hex";
import { WIN_SCORE, type CaribbeanState, type LostShip } from "./types";
import { gameOverResult } from "./gameOver";

/**
 * How the game ends (#289): a captain wins on glory, or every seat is out
 * of the game (#265) and the one with the most glory ends on top. The result
 * says which, so the game-over screen never calls running out of captains a
 * victory.
 */

const out = (score: number): LostShip => ({ cause: "sunk", captain: { id: "dead", name: "Blackbeard", nation: "England", ability: "" }, score, stashedGold: 0, eliminated: true });

function atSea(score: number) {
  const ship = createShipState(hex(0, 0), "Sloop");
  ship.captain = { id: "drake", name: "Drake", nation: "England", ability: "" };
  ship.score = score;
  return ship;
}

type Table = Pick<CaribbeanState, "ships" | "lostShips">;

describe("gameOverResult", () => {
  it("is a win on glory when a captain reaches the winning glory, naming that captain", () => {
    const G: Table = { ships: { "0": atSea(1), "1": atSea(WIN_SCORE) } };
    expect(gameOverResult(G, ["0", "1"])).toEqual({ reason: "glory", winner: "1", captainName: "Drake", score: WIN_SCORE });
  });

  it("counts the glory of a seat whose captain fell winning it (#369): a win on glory, the player named by seat", () => {
    const fallen: LostShip = { cause: "sunk", captain: { id: "dead", name: "Blackbeard", nation: "England", ability: "" }, score: WIN_SCORE, stashedGold: 0 };
    const G: Table = { ships: { "1": atSea(4) }, lostShips: { "0": fallen } };
    expect(gameOverResult(G, ["0", "1"])).toEqual({ reason: "glory", winner: "0", captainName: "Player 1", score: WIN_SCORE });
  });

  it("two seats on the winning glory, one afloat and one fallen: the first seat in play order wins", () => {
    const fallen: LostShip = { cause: "sunk", captain: { id: "dead", name: "Blackbeard", nation: "England", ability: "" }, score: WIN_SCORE, stashedGold: 0 };
    expect(gameOverResult({ ships: { "1": atSea(WIN_SCORE) }, lostShips: { "0": fallen } }, ["0", "1"])).toEqual({ reason: "glory", winner: "0", captainName: "Player 1", score: WIN_SCORE });
    expect(gameOverResult({ ships: { "0": atSea(WIN_SCORE) }, lostShips: { "1": fallen } }, ["0", "1"])).toEqual({ reason: "glory", winner: "0", captainName: "Drake", score: WIN_SCORE });
  });

  it("reaching the winning glory always ends the game on glory: a seat out of the game on it wins while the others play on", () => {
    const G: Table = { ships: { "1": atSea(4) }, lostShips: { "0": out(WIN_SCORE) } };
    expect(gameOverResult(G, ["0", "1"])).toEqual({ reason: "glory", winner: "0", captainName: "Player 1", score: WIN_SCORE });
  });

  it("every seat out, one on the winning glory: a win on glory, not the all-out ending", () => {
    const G: Table = { ships: {}, lostShips: { "0": out(4), "1": out(WIN_SCORE) } };
    expect(gameOverResult(G, ["0", "1"])).toEqual({ reason: "glory", winner: "1", captainName: "Player 2", score: WIN_SCORE });
  });

  it("breaks a tie on the winning glory by the play order it is given", () => {
    const G: Table = { ships: { "0": atSea(WIN_SCORE), "1": atSea(WIN_SCORE) } };
    expect(gameOverResult(G, ["1", "0"])).toMatchObject({ winner: "1" });
  });

  it("is the all-out ending when every seat is out, with the most glory and no captain", () => {
    const G: Table = { ships: {}, lostShips: { "0": out(2), "1": out(4) } };
    expect(gameOverResult(G, ["0", "1"])).toEqual({ reason: "allOut", winner: "1", leaders: ["1"], score: 4 });
  });

  it("is the all-out ending for a solo seat out of captains", () => {
    const G: Table = { ships: {}, lostShips: { "0": out(3) } };
    expect(gameOverResult(G, ["0"])).toEqual({ reason: "allOut", winner: "0", leaders: ["0"], score: 3 });
  });

  it("on a tie for the most glory, names every seat tied for it, the first as the winner", () => {
    const G: Table = { ships: {}, lostShips: { "0": out(4), "1": out(2), "2": out(4) } };
    expect(gameOverResult(G, ["0", "1", "2"])).toEqual({ reason: "allOut", winner: "0", leaders: ["0", "2"], score: 4 });
  });

  it("names a seat with no captain by its number on a glory win", () => {
    const winner = atSea(WIN_SCORE);
    winner.captain = undefined;
    expect(gameOverResult({ ships: { "2": winner } }, ["0", "1", "2"])).toMatchObject({ captainName: "Player 3" });
  });

  it("is nothing while the game goes on", () => {
    const G: Table = { ships: { "1": atSea(2) }, lostShips: { "0": out(4) } };
    expect(gameOverResult(G, ["0", "1"])).toBeUndefined();
  });

  it("stays JSON, as boardgame.io's ctx.gameover must", () => {
    const G: Table = { ships: {}, lostShips: { "0": out(3) } };
    const result = gameOverResult(G, ["0"]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
