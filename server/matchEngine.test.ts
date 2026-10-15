import { describe, expect, it } from "vitest";
import { createMatchState } from "./matchEngine";

describe("createMatchState", () => {
  it("seeds the match with the seed it is given, not boardgame.io's clock-based default", () => {
    const state = createMatchState(2, { mapSize: "small", mapSeed: 3 }, "0123456789abcdef0123456789abcdef");
    expect((state.plugins.random.data as { seed: string }).seed).toBe("0123456789abcdef0123456789abcdef");
  });

  it("deals different hands for different seeds on the same map", () => {
    const a = createMatchState(2, { mapSize: "small", mapSeed: 3 }, "a".repeat(32));
    const b = createMatchState(2, { mapSize: "small", mapSeed: 3 }, "b".repeat(32));
    expect(a.G.cells).toEqual(b.G.cells);
    expect(a.G.captainDeck.map((c) => c.id)).not.toEqual(b.G.captainDeck.map((c) => c.id));
  });
});
