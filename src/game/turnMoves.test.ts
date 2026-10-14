import { describe, it, expect } from "vitest";
import { createShipState } from "./economy";
import { hex } from "./hex";
import type { MapCell } from "./types";
import { movesLeft, movesUsed, spendMove, turnRunsOut } from "./turnMoves";
import type { CaribbeanState } from "./types";

const cells: MapCell[] = [
  { hex: hex(1, -1), terrain: "island", elevation: 2, hasPort: true, dockingHex: hex(0, 0) },
  { hex: hex(0, 0), terrain: "water", elevation: 0, hasPort: false },
  { hex: hex(0, 1), terrain: "water", elevation: 0, hasPort: false },
];

function state(at = hex(0, 1), used?: number) {
  return { ships: { "0": createShipState(at, "Flute") }, cells, wrap: null, movesUsed: used } as Pick<
    CaribbeanState,
    "ships" | "cells" | "wrap" | "movesUsed"
  >;
}

describe("turnMoves (#227)", () => {
  it("counts a missing counter as no moves used", () => {
    expect(movesUsed(state())).toBe(0);
    expect(movesLeft(state(), "0")).toBe(2);
  });

  it("takes the moves used off the class's moves, never below none", () => {
    expect(movesLeft(state(hex(0, 1), 1), "0")).toBe(1);
    expect(movesLeft(state(hex(0, 1), 5), "0")).toBe(0);
  });

  it("gives a player with no ship no moves", () => {
    expect(movesLeft(state(), "7")).toBe(0);
    expect(turnRunsOut(state(), "7")).toBe(false);
  });

  it("spends one move at a time", () => {
    const G = state() as CaribbeanState;
    spendMove(G);
    spendMove(G);
    expect(G.movesUsed).toBe(2);
  });

  it("runs the turn out when the moves are spent at sea, not while docked", () => {
    expect(turnRunsOut(state(hex(0, 1), 1), "0")).toBe(false);
    expect(turnRunsOut(state(hex(0, 1), 2), "0")).toBe(true);
    expect(turnRunsOut(state(hex(0, 0), 2), "0")).toBe(false);
  });
});
