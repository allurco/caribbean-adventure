import { describe, expect, it } from "vitest";
import { createWrap, hex, type MapWrap } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset, type MapSizeId } from "../../game/mapConfig";
import type { Elevation, MapCell } from "../../game/types";
import {
  ISLAND_ARCHETYPES,
  MAX_ARCHETYPE_SHARE,
  MIN_ARCHETYPES,
  archetypeOdds,
  cellsById,
  islandArchetypes,
  islandTraits,
  pickArchetype,
  qualifyingArchetypes,
  type IslandArchetype,
  type IslandTraits,
} from "./islandArchetypes";
import { findIslands } from "./islands";

const traits = (t: Partial<IslandTraits>): IslandTraits => ({ cells: 5, maxElevation: 3, lowShare: 0.8, hasPort: false, ...t });

const land = (q: number, r: number, elevation: Elevation, hasPort = false): MapCell => ({ hex: hex(q, r), terrain: "island", hasPort, elevation });
const water = (q: number, r: number): MapCell => ({ hex: hex(q, r), terrain: "water", hasPort: false, elevation: 0 });

describe("which archetypes an island qualifies for (#177, decision 11)", () => {
  it("a volcanic peak needs a mountain cell", () => {
    expect(qualifyingArchetypes(traits({ maxElevation: 3 }))).toContain("volcanic");
    expect(qualifyingArchetypes(traits({ maxElevation: 2 }))).not.toContain("volcanic");
  });

  it("a jungle highland needs elevation 2 or less on most of its cells", () => {
    expect(qualifyingArchetypes(traits({ lowShare: 0.8 }))).toContain("jungle");
    expect(qualifyingArchetypes(traits({ lowShare: 0.5 }))).not.toContain("jungle");
  });

  it("an atoll is three cells or fewer, or low all over", () => {
    expect(qualifyingArchetypes(traits({ cells: 3 }))).toContain("atoll");
    expect(qualifyingArchetypes(traits({ cells: 4, maxElevation: 1 }))).toContain("atoll");
    expect(qualifyingArchetypes(traits({ cells: 4, maxElevation: 2 }))).not.toContain("atoll");
  });

  it("a mesa needs three cells and a cell of elevation 2", () => {
    expect(qualifyingArchetypes(traits({ cells: 3, maxElevation: 2 }))).toContain("mesa");
    expect(qualifyingArchetypes(traits({ cells: 2, maxElevation: 2 }))).not.toContain("mesa");
    expect(qualifyingArchetypes(traits({ cells: 3, maxElevation: 1 }))).not.toContain("mesa");
  });

  it("a rocky isle is small and never has a port", () => {
    expect(qualifyingArchetypes(traits({ cells: 4 }))).toContain("rocky");
    expect(qualifyingArchetypes(traits({ cells: 5 }))).not.toContain("rocky");
    expect(qualifyingArchetypes(traits({ cells: 3, hasPort: true }))).not.toContain("rocky");
  });

  it("every island qualifies for one at least: a mountain makes it volcanic, else it is low enough for jungle", () => {
    for (const cells of [1, 2, 3, 4, 8, 20]) {
      for (const maxElevation of [1, 2, 3]) {
        for (const lowShare of maxElevation === 3 ? [0, 0.5, 0.9] : [1]) {
          for (const hasPort of [false, true]) {
            expect(qualifyingArchetypes({ cells, maxElevation, lowShare, hasPort }).length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("reads the traits off the map's cells", () => {
    const cells = [land(0, 0, 1, true), land(1, 0, 2), land(1, -1, 3), land(0, -1, 2), water(3, 3)];
    const [island] = findIslands(cells, null);
    expect(islandTraits(island, cellsById(cells, null))).toEqual({ cells: 4, maxElevation: 3, lowShare: 0.75, hasPort: true });
  });
});

describe("the draw", () => {
  it("renormalises the decided weights over the archetypes the island qualifies for", () => {
    const odds = archetypeOdds(traits({ cells: 3, maxElevation: 2, lowShare: 1, hasPort: false }));
    // Jungle, atoll, mesa and rocky: 0.25 + 0.2 + 0.15 + 0.1.
    expect(odds.volcanic).toBe(0);
    expect(odds.jungle).toBeCloseTo(0.25 / 0.7, 12);
    expect(odds.rocky).toBeCloseTo(0.1 / 0.7, 12);
    expect(ISLAND_ARCHETYPES.reduce((sum, a) => sum + odds[a], 0)).toBeCloseTo(1, 12);
  });

  it("picks by cumulative odds, so each archetype takes its share of [0, 1)", () => {
    const odds = archetypeOdds(traits({ cells: 3, maxElevation: 3, lowShare: 0.7, hasPort: true }));
    const tally: Record<string, number> = {};
    const steps = 10_000;
    for (let i = 0; i < steps; i++) {
      const a = pickArchetype(odds, (i + 0.5) / steps);
      tally[a] = (tally[a] ?? 0) + 1;
    }
    for (const a of ISLAND_ARCHETYPES) expect((tally[a] ?? 0) / steps).toBeCloseTo(odds[a], 3);
    expect(tally.rocky).toBeUndefined();
  });
});

describe("a map's archetypes", () => {
  const preset = getMapPreset("medium");
  const wrap = createWrap(preset.columns);
  const cells = generateMap(preset, 7, wrap);

  it("S1: the same seed draws the same archetypes, whatever the order of the cells", () => {
    const a = islandArchetypes(cells, wrap, 7);
    expect(islandArchetypes(structuredClone(cells).reverse(), wrap, 7)).toEqual(a);
  });

  it("S2: another seed draws another list", () => {
    const list = (seed: number) => [...islandArchetypes(cells, wrap, seed).values()].join(",");
    expect(list(8)).not.toBe(list(7));
  });

  it("never changes a cell", () => {
    const before = structuredClone(cells);
    islandArchetypes(cells, wrap, 7);
    expect(cells).toEqual(before);
  });
});

/**
 * S3 (#158): 200 seeds per size. An island takes an archetype only where it
 * qualifies, a port never stands on a rocky isle, every medium and large map
 * has three kinds or more and no kind holds more than 60 % of a map's islands.
 * Over the sweep each archetype's share lies within `FREQUENCY_TOLERANCE` of
 * its expected share, the mean of its renormalised odds over every island:
 * the draw keeps the decided weights, and the map-level balance barely
 * moves them.
 */
const SEEDS = 200;
const FREQUENCY_TOLERANCE = 0.025;
/**
 * Every kind is seen. Qualification shapes the shares: the generator's
 * smallest islands are three cells and none is low all over, so only those
 * three-cell isles can be atolls (about 7 % of the islands, against a weight
 * of 0.2), and the rocky isle is held to small isles without a port (about
 * 5 %, against 0.1); the jungle highland and the mesa, which nearly every
 * island qualifies for, take up the difference (about 39 % and 23 %).
 */
const MIN_OBSERVED_SHARE = 0.04;

function sweep(size: MapSizeId) {
  const preset = getMapPreset(size);
  const wrap: MapWrap = createWrap(preset.columns);
  const observed: Record<IslandArchetype, number> = { volcanic: 0, jungle: 0, atoll: 0, mesa: 0, rocky: 0 };
  const expected: Record<IslandArchetype, number> = { volcanic: 0, jungle: 0, atoll: 0, mesa: 0, rocky: 0 };
  let islands = 0;
  let fewestKinds = Infinity;
  let largestShare = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const cells = generateMap(preset, seed, wrap);
    const drawn = islandArchetypes(cells, wrap, seed);
    const counts = new Map<IslandArchetype, number>();
    const byId = cellsById(cells, wrap);
    for (const island of findIslands(cells, wrap)) {
      const t = islandTraits(island, byId);
      const archetype = drawn.get(island.id)!;
      expect(qualifyingArchetypes(t), `${size} seed ${seed} island ${island.id}`).toContain(archetype);
      if (t.hasPort) expect(archetype).not.toBe("rocky");
      const odds = archetypeOdds(t);
      for (const a of ISLAND_ARCHETYPES) expected[a] += odds[a];
      observed[archetype]++;
      counts.set(archetype, (counts.get(archetype) ?? 0) + 1);
      islands++;
    }
    fewestKinds = Math.min(fewestKinds, counts.size);
    largestShare = Math.max(largestShare, Math.max(...counts.values()) / drawn.size);
  }
  const share = (tally: Record<IslandArchetype, number>) =>
    Object.fromEntries(ISLAND_ARCHETYPES.map((a) => [a, tally[a] / islands])) as Record<IslandArchetype, number>;
  return { observed: share(observed), expected: share(expected), fewestKinds, largestShare };
}

describe("archetypes over 200 seeds per map size (S3)", () => {
  it.each(["small", "medium", "large"] as const)("%s: only where the island qualifies, within the weight bands", (size) => {
    const { observed, expected, fewestKinds, largestShare } = sweep(size);
    for (const a of ISLAND_ARCHETYPES) {
      expect(Math.abs(observed[a] - expected[a]), `${a}: ${observed[a].toFixed(3)} against ${expected[a].toFixed(3)}`).toBeLessThan(
        FREQUENCY_TOLERANCE
      );
      // Every kind is common enough to be seen on the board.
      expect(observed[a], a).toBeGreaterThan(MIN_OBSERVED_SHARE);
    }
    expect(largestShare).toBeLessThanOrEqual(MAX_ARCHETYPE_SHARE);
    if (size !== "small") expect(fewestKinds).toBeGreaterThanOrEqual(MIN_ARCHETYPES);
  }, 60_000);
});
