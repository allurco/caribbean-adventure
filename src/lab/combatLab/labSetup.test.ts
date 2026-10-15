import { describe, expect, it } from "vitest";
import { generateMapFor } from "../../game/mapRequest";
import { hexToWorld, wrappedDistance, createWrap } from "../../game/hex";
import { getMapPreset } from "../../game/mapConfig";
import { combatSite, parseLabParams } from "./labSetup";

describe("lab URL", () => {
  it("defaults to a frigate against a galleon, a hex apart, A acting", () => {
    expect(parseLabParams("?view=combatlab")).toEqual({ a: "Frigate", b: "Galleon", gap: 1, actor: "a", play: [], seed: 4242 });
  });

  it("reads the classes, the gap, the actor, the seed and a sequence of beats to play", () => {
    expect(parseLabParams("?view=combatlab&a=Sloop&b=Flute&gap=2&actor=b&seed=7&play=declare,rake,nonsense,sink")).toEqual({
      a: "Sloop",
      b: "Flute",
      gap: 2,
      actor: "b",
      play: ["declare", "rake", "sink"],
      seed: 7,
    });
  });

  it("ignores what it does not know", () => {
    expect(parseLabParams("?a=Junk&gap=5&actor=c&seed=x")).toEqual({ a: "Frigate", b: "Galleon", gap: 1, actor: "a", play: [], seed: 4242 });
  });
});

describe("the combat site", () => {
  const cells = generateMapFor({ mapSize: "small", mapSeed: 4242 });
  const wrap = createWrap(getMapPreset("small").columns);
  const toward: [number, number] = [Math.cos(1.1), Math.sin(1.1)];

  it("puts both ships on open water, `gap` hexes apart, the second downwind of the first", () => {
    for (const gap of [1, 2] as const) {
      const site = combatSite(cells, wrap, toward, gap);
      const water = new Set(cells.filter((c) => c.terrain === "water").map((c) => `${c.hex.q},${c.hex.r}`));
      expect(water.has(`${site.a.q},${site.a.r}`)).toBe(true);
      expect(water.has(`${site.b.q},${site.b.r}`)).toBe(true);
      expect(wrappedDistance(site.a, site.b, wrap)).toBe(gap);
      const [ax, , az] = hexToWorld(site.a);
      const [bx, , bz] = hexToWorld(site.b);
      expect((bx - ax) * toward[0] + (bz - az) * toward[1]).toBeGreaterThan(0);
    }
  });

  it("lays both ships across the wind, on a beam reach", () => {
    const site = combatSite(cells, wrap, toward, 1);
    expect(Math.abs(Math.sin(site.heading) * toward[0] + Math.cos(site.heading) * toward[1])).toBeLessThan(1e-9);
  });
});
