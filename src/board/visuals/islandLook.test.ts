import { describe, expect, it } from "vitest";
import { createWrap, hex, hexToWorld, wrapWorldWidth } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import type { Elevation, MapCell } from "../../game/types";
import { ISLAND_ARCHETYPES } from "./islandArchetypes";
import { findIslands, mapCellId } from "./islands";
import {
  ISLAND_LOOK_BANDS,
  MAX_PROP_FACTOR,
  NEUTRAL_LAND_LOOK,
  boulderFactor,
  islandLooks,
  landLookAt,
  lookOfCell,
  rockTintRgb,
  shrubFactor,
  treeFactor,
  type IslandLook,
} from "./islandLook";

const preset = getMapPreset("medium");
const wrap = createWrap(preset.columns);
const SEEDS = 40;

const inBand = (value: number, [lo, hi]: readonly [number, number]) => value >= lo - 1e-12 && value <= hi + 1e-12;

function everyLook(): IslandLook[] {
  const out: IslandLook[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) out.push(...islandLooks(generateMap(preset, seed, wrap), wrap, seed).islands);
  return out;
}
const looks = everyLook();

describe("an island's look (#177)", () => {
  it("draws every parameter within its archetype's band, and a species mix that sums to one", () => {
    for (const look of looks) {
      const bands = ISLAND_LOOK_BANDS[look.archetype];
      expect(inBand(look.peakHeight, bands.peakHeight)).toBe(true);
      expect(inBand(look.summitOffset.distance, bands.summitOffset)).toBe(true);
      expect(look.summitOffset.angle).toBeGreaterThanOrEqual(0);
      expect(look.summitOffset.angle).toBeLessThan(Math.PI * 2);
      expect(inBand(look.ruggedness, bands.ruggedness)).toBe(true);
      expect(inBand(look.rockTint, bands.rockTint)).toBe(true);
      expect(inBand(look.vegetationDensity, bands.vegetationDensity)).toBe(true);
      expect(inBand(look.beachWidth, bands.beachWidth)).toBe(true);
      expect(inBand(look.reefExtent, bands.reefExtent)).toBe(true);
      expect(inBand(look.lagoonTint, bands.lagoonTint)).toBe(true);
      expect(inBand(look.boulderCount, bands.boulderCount)).toBe(true);
      const mix = look.speciesMix;
      expect(mix.palm + mix.broadleaf + mix.shrub + mix.mangrove).toBeCloseTo(1, 12);
      for (const share of Object.values(mix)) expect(share).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives each kind its character (decision 11): grey bare rock isles, warm volcanic rock, wide atoll beaches, dense jungle", () => {
    const b = ISLAND_LOOK_BANDS;
    expect(b.rocky.rockTint[0]).toBeGreaterThan(b.volcanic.rockTint[1]);
    for (const a of ISLAND_ARCHETYPES) {
      if (a !== "atoll") expect(b.atoll.beachWidth[0], a).toBeGreaterThan(b[a].beachWidth[1]);
      if (a !== "jungle") expect(b.jungle.vegetationDensity[0], a).toBeGreaterThan(b[a].vegetationDensity[1]);
      if (a !== "rocky") expect(b.rocky.vegetationDensity[1], a).toBeLessThan(b[a].vegetationDensity[0]);
      if (a !== "atoll") expect(b.atoll.reefExtent[0], a).toBeGreaterThan(b[a].reefExtent[1]);
    }
    // Atolls: palms only, no broadleaf.
    expect(b.atoll.species.broadleaf).toEqual([0, 0]);
    // Volcanic peaks rise highest; mesas and rocky isles carry the most boulders.
    expect(b.volcanic.peakHeight[0]).toBeGreaterThan(b.jungle.peakHeight[1]);
    expect(b.rocky.boulderCount[0]).toBeGreaterThan(b.jungle.boulderCount[1]);
  });

  it("looks the same for the same island whatever the order of the cells", () => {
    const cells = generateMap(preset, 3, wrap);
    expect(islandLooks(structuredClone(cells).reverse(), wrap, 3)).toEqual(islandLooks(cells, wrap, 3));
  });

  it("knows each land cell's island", () => {
    const cells = generateMap(preset, 3, wrap);
    const map = islandLooks(cells, wrap, 3);
    for (const island of findIslands(cells, wrap)) {
      const look = map.islands.find((l) => l.id === island.id)!;
      for (const h of island.cells) expect(lookOfCell(map, { hex: h })).toBe(look);
    }
    expect(lookOfCell(map, cells.find((c) => c.terrain === "water")!)).toBeUndefined();
  });
});

describe("what the look scales (#177)", () => {
  it("keeps every family's count within MAX_PROP_FACTOR, and the map's palms and shrubs at or under today's on average", () => {
    let trees = 0;
    let shrubs = 0;
    for (const look of looks) {
      expect(treeFactor(look)).toBeGreaterThanOrEqual(0);
      expect(treeFactor(look)).toBeLessThanOrEqual(MAX_PROP_FACTOR);
      expect(shrubFactor(look)).toBeLessThanOrEqual(MAX_PROP_FACTOR);
      expect(boulderFactor(look)).toBeLessThanOrEqual(MAX_PROP_FACTOR);
      trees += treeFactor(look);
      shrubs += shrubFactor(look);
    }
    expect(trees / looks.length).toBeLessThanOrEqual(1);
    expect(trees / looks.length).toBeGreaterThan(0.6);
    expect(shrubs / looks.length).toBeLessThanOrEqual(1.1);
    expect(shrubs / looks.length).toBeGreaterThan(0.6);
  });

  it("thins a rocky isle's palms and thickens a jungle's", () => {
    const rocky = looks.filter((l) => l.archetype === "rocky");
    const jungle = looks.filter((l) => l.archetype === "jungle");
    expect(Math.max(...rocky.map(treeFactor))).toBeLessThan(Math.min(...jungle.map(treeFactor)));
    expect(Math.min(...jungle.map(treeFactor))).toBeGreaterThan(1);
  });

  it("tints rock from warm brown at 0 to grey at 1", () => {
    const [wr, , wb] = rockTintRgb(0);
    const [gr, gg, gb] = rockTintRgb(1);
    expect(wr).toBeGreaterThan(wb);
    expect(Math.abs(gr - gb)).toBeLessThan(0.1);
    expect(Math.abs(gr - gg)).toBeLessThan(0.1);
  });
});

describe("landLookAt: the look the land mesh paints a point with", () => {
  const land = (q: number, r: number, elevation: Elevation): MapCell => ({ hex: hex(q, r), terrain: "island", hasPort: false, elevation });
  const cells: MapCell[] = [];
  for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) cells.push({ hex: hex(q, r), terrain: "water", hasPort: false, elevation: 0 });
  const set = (c: MapCell) => cells.splice(cells.findIndex((x) => mapCellId(x) === mapCellId(c)), 1, c);
  set(land(0, 0, 3));
  set(land(1, 0, 2));
  set(land(4, -2, 2));
  const map = islandLooks(cells, null, 11);
  const at = landLookAt(map, null);

  it("is the island's own look on its cells", () => {
    const look = lookOfCell(map, { hex: hex(0, 0) })!;
    const [x, , z] = hexToWorld(hex(1, 0));
    expect(at(x, z)).toEqual({ rockTint: rockTintRgb(look.rockTint), beachWidth: look.beachWidth });
  });

  it("is the nearest island's look on a water cell beside land, where the noisy coast may stand", () => {
    const [x, , z] = hexToWorld(hex(2, 0));
    const look = lookOfCell(map, { hex: hex(1, 0) })!;
    expect(at(x - 0.3, z)).toEqual({ rockTint: rockTintRgb(look.rockTint), beachWidth: look.beachWidth });
  });

  it("is neutral in open water", () => {
    const [x, , z] = hexToWorld(hex(-5, 5));
    expect(at(x, z)).toBe(NEUTRAL_LAND_LOOK);
  });

  it("is the same in every world copy", () => {
    const generated = generateMap(preset, 5, wrap);
    const sample = landLookAt(islandLooks(generated, wrap, 5), wrap);
    const period = wrapWorldWidth(wrap);
    for (const cell of generated.filter((c) => c.terrain === "island").slice(0, 20)) {
      const [x, , z] = hexToWorld(cell.hex);
      expect(sample(x + period, z)).toEqual(sample(x, z));
      expect(sample(x - period, z)).toEqual(sample(x, z));
    }
  });
});
