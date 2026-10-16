import { describe, expect, it } from "vitest";
import { createShipState } from "../game/economy";
import { hex } from "../game/hex";
import type { CaribbeanState, CombatState } from "../game/types";
import { hudStackShows } from "./hudStack";

// Whether the HUD's top-left stack (sound, Save & leave, the glory panel) is
// on the board, for the harbour link that sits beside it on a phone (#125).
type Table = Pick<CaribbeanState, "ships" | "lostShips" | "combat">;

const sailing = (): Table => ({ ships: { "0": createShipState(hex(0, 0)), "1": createShipState(hex(1, 0)) } });

const fight: CombatState = {
  attackerId: "0",
  defenderId: "1",
  round: 1,
  stage: "seamanship",
  seamanshipWinner: null,
  seamanshipRolls: {},
  actionChosen: null,
  attackerHits: 0,
  defenderHits: 0,
  volleys: [],
  distance: 1,
  isNPCCombat: false,
  fleeOutcome: null,
  fleeRolls: null,
};

describe("hudStackShows", () => {
  it("shows on a captain's turn at sea", () => {
    expect(hudStackShows(sailing(), { phase: "main", currentPlayer: "0" })).toBe(true);
  });

  it("is down through the captain draft", () => {
    expect(hudStackShows(sailing(), { phase: "draft", currentPlayer: "0" })).toBe(false);
  });

  it("is down while a seat whose ship was lost picks a new captain (#265)", () => {
    // The lost ship has left `G.ships`; the seat waits in `G.lostShips`.
    const G: Table = { ships: { "0": createShipState(hex(0, 0)) }, lostShips: { "1": { cause: "sunk", score: 3, stashedGold: 0 } } };
    expect(hudStackShows(G, { phase: "main", currentPlayer: "1" })).toBe(false);
  });

  it("is down in a fight", () => {
    expect(hudStackShows({ ...sailing(), combat: fight }, { phase: "combat", currentPlayer: "0" })).toBe(false);
  });

  it("is down once the match is over, over the game-over screen", () => {
    expect(hudStackShows(sailing(), { phase: "main", currentPlayer: "0", gameover: { winner: "0" } })).toBe(false);
  });
});
