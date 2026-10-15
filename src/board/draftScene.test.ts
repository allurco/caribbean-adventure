import { describe, expect, it } from "vitest";
import { Caribbean } from "../game/Game";
import type { CaribbeanState } from "../game/types";
import { sceneStateFor } from "./draftScene";

function setupState(): CaribbeanState {
  const random = { Shuffle: <T,>(xs: T[]) => xs, Number: () => 0.5, D6: () => 3, Die: () => 1 };
  const setup = Caribbean.setup as unknown as (context: { ctx: { numPlayers: number }; random: typeof random }) => CaribbeanState;
  return setup({ ctx: { numPlayers: 2 }, random });
}

describe("the scene behind the draft", () => {
  it("draws no player ship that has no captain yet", () => {
    const G = setupState();
    const drawn = sceneStateFor(G, "draft");
    expect(Object.keys(drawn.ships)).toEqual([]);
    expect(drawn.cells).toBe(G.cells);
  });

  it("draws a ship once its captain is picked", () => {
    const G = setupState();
    const ships = { ...G.ships, "0": { ...G.ships["0"], captain: G.draftHands["0"][0] } };
    expect(Object.keys(sceneStateFor({ ...G, ships }, "draft").ships)).toEqual(["0"]);
  });

  it("draws the game as it is once the draft is over", () => {
    const G = setupState();
    expect(sceneStateFor(G, "main")).toBe(G);
  });
});
