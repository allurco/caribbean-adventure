import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { canonicalHex, createWrap, hexToWorld, neighbors, type Hex, type MapWrap } from "../../game/hex";
import type { Biome, MapCell } from "../../game/types";
import { createTerrainHeightField, SEA_LEVEL, terrainSeedFromCells } from "./terrainHeightField";
import { ROCK_VARIANT_REACH } from "./rockGeometry";
import { metresToUnits } from "./worldScale";
import {
  BOULDER_SAMPLES_PER_EDGE,
  BOULDERS_PER_COAST_EDGE,
  MAX_OFFSHORE_REACH,
  SHIP_HULL_CLEARANCE,
  SHORE_BAND,
  SHORE_BOULDER_BIOMES,
  SUBMERGED_CROWN_DEPTH_METRES,
  WET_BAND,
  WET_DARKENING,
  boulderReach,
  shoreBoulders,
  type ShoreBoulder,
  type ShoreField,
} from "./shoreBoulders";

const preset = getMapPreset("small");
const wrap = createWrap(preset.columns);
const cells = generateMap(preset, 11, wrap);
const seed = terrainSeedFromCells(cells);
const field = createTerrainHeightField(cells, seed, { wrap });
const boulders = shoreBoulders(cells, field, wrap, seed);

const key = (h: Hex) => `${h.q},${h.r}`;
const landKeys = new Set(cells.filter((c) => c.terrain === "island").map((c) => key(c.hex)));
const isLand = (h: Hex, w: MapWrap) => landKeys.has(key(canonicalHex(h, w)));
const cellOf = (h: Hex) => cells.find((c) => c.hex.q === h.q && c.hex.r === h.r)!;
/** A land cell whose coasts get boulders. */
const bouldered = (c: MapCell) => c.terrain === "island" && c.biome !== undefined && SHORE_BOULDER_BIOMES.includes(c.biome);
/** The same cells with every land cell's biome set to `biome` (the field does not read biomes). */
const rebiomed = (list: readonly MapCell[], biome: Biome): MapCell[] =>
  list.map((c) => (c.terrain === "island" ? { ...c, biome } : c));

/** World centres of the water hexes a ship could sit in near a land hex: its ring-1 and ring-2 neighbours. */
function waterCentresNear(h: Hex, w: MapWrap): [number, number][] {
  const seen = new Map<string, Hex>();
  for (const n of neighbors(h)) {
    seen.set(key(n), n);
    for (const m of neighbors(n)) if (key(m) !== key(h)) seen.set(key(m), m);
  }
  return [...seen.values()]
    .filter((n) => !isLand(n, w))
    .map((n) => {
      const [x, , z] = hexToWorld(n);
      return [x, z];
    });
}

/** Signed distance of (x, z) past the edge between land hex `h` and neighbour `n`: positive on the water side. */
function pastEdge(x: number, z: number, h: Hex, n: Hex): number {
  const [cx, , cz] = hexToWorld(h);
  const [nx, , nz] = hexToWorld(n);
  const len = Math.hypot(nx - cx, nz - cz);
  const ux = (nx - cx) / len;
  const uz = (nz - cz) / len;
  return (x - cx) * ux + (z - cz) * uz - len / 2;
}

const coastal = cells.filter((c) => c.terrain === "island" && neighbors(c.hex).some((n) => !isLand(n, wrap)));
const coastEdges = (list: readonly MapCell[]) =>
  list.reduce((sum, c) => sum + neighbors(c.hex).filter((n) => !isLand(n, wrap)).length, 0);

describe("shoreBoulders", () => {
  it("places about BOULDERS_PER_COAST_EDGE boulders per rock or grass coastal edge", () => {
    const edges = coastEdges(coastal.filter(bouldered));
    expect(edges).toBeGreaterThan(30);
    expect(boulders.length).toBeGreaterThan(edges * BOULDERS_PER_COAST_EDGE * 0.7);
    expect(boulders.length).toBeLessThan(edges * BOULDERS_PER_COAST_EDGE * 1.3);
    expect(boulders.length).toBeLessThanOrEqual(edges * BOULDER_SAMPLES_PER_EDGE);
  });

  it("only allows rock and grass coasts, never sand", () => {
    expect([...SHORE_BOULDER_BIOMES].sort()).toEqual(["GRASS", "ROCK"]);
  });

  it("places nothing on a map whose only coasts are sand", () => {
    expect(coastal.some((c) => c.biome === "SAND")).toBe(true);
    expect(shoreBoulders(rebiomed(cells, "SAND"), field, wrap, seed)).toEqual([]);
  });

  it("places boulders on rock coasts and on grass coasts", () => {
    for (const biome of ["ROCK", "GRASS"] as const) {
      const list = shoreBoulders(rebiomed(cells, biome), field, wrap, seed);
      expect(list.length).toBeGreaterThan(coastEdges(coastal) * BOULDERS_PER_COAST_EDGE * 0.7);
    }
  });

  it("belongs only to rock or grass cells on a mixed map", () => {
    expect(coastal.filter((c) => c.biome === "SAND").length).toBeGreaterThan(0);
    expect(coastal.filter(bouldered).length).toBeGreaterThan(0);
    expect(boulders.length).toBeGreaterThan(0);
    for (const b of boulders) expect(bouldered(cellOf(b.hex))).toBe(true);
  });

  it("skipping the sand coasts leaves the kept boulders exactly where they were", () => {
    // Each coastal edge draws its own hash stream, so the boulders on the rock and
    // grass coasts are the same ones as on the map with every coast allowed (only
    // the sand cells' base colour differs there, and they have no boulders here).
    const allAllowed = shoreBoulders(rebiomed(cells, "ROCK"), field, wrap, seed);
    const strip = (b: ShoreBoulder) => ({ ...b, variation: { ...b.variation, baseColor: 0 } });
    const kept = allAllowed.filter((b) => bouldered(cellOf(b.hex))).map(strip);
    expect(kept.length).toBeLessThan(allAllowed.length);
    expect(boulders.map(strip)).toEqual(kept);
  });

  it("is deterministic", () => {
    expect(shoreBoulders(cells, field, wrap, seed)).toEqual(boulders);
  });

  it("hashes the whole 32-bit seed: a seed differing in any one bit gives a different layout", () => {
    for (const bit of [0, 7, 20, 25, 31]) {
      const other = shoreBoulders(cells, field, wrap, seed ^ (1 << bit));
      expect(other.length).toBeGreaterThan(0);
      expect(other.map((b) => b.worldX)).not.toEqual(boulders.map((b) => b.worldX));
    }
  });

  it("belongs to a coastal land cell and lies along one of its water edges", () => {
    for (const b of boulders) {
      const cell = cellOf(b.hex);
      expect(cell.terrain).toBe("island");
      const waterEdges = neighbors(b.hex).filter((n) => !isLand(n, wrap));
      expect(waterEdges.length).toBeGreaterThan(0);
      // Within a hex radius of the cell centre, on the water side of the cell.
      const [cx, , cz] = hexToWorld(b.hex);
      expect(Math.hypot(b.worldX - cx, b.worldZ - cz)).toBeLessThan(1.2);
    }
  });

  it("keeps every boulder within the coast-distance band straddling the waterline", () => {
    let emergent = 0;
    let offshore = 0;
    for (const b of boulders) {
      const d = field.sampleCoastDistance(b.worldX, b.worldZ);
      expect(d).toBeGreaterThanOrEqual(SHORE_BAND[0] - 1e-9);
      expect(d).toBeLessThanOrEqual(SHORE_BAND[1] + 1e-9);
      expect(b.coastDistance).toBeCloseTo(d, 9);
      if (d >= 0) emergent++;
      else offshore++;
    }
    // Some on the beach, some in the water.
    expect(emergent).toBeGreaterThan(boulders.length * 0.2);
    expect(offshore).toBeGreaterThan(boulders.length * 0.2);
  });

  it("caps the offshore reach: no drawn rim passes MAX_OFFSHORE_REACH beyond its land hex's edge", () => {
    expect(MAX_OFFSHORE_REACH).toBeLessThanOrEqual(0.3);
    let capped = 0;
    for (const b of boulders) {
      const reach = boulderReach(b.variation);
      expect(b.reach).toBeCloseTo(reach, 9);
      for (const n of neighbors(b.hex)) {
        if (isLand(n, wrap)) continue;
        const past = pastEdge(b.worldX, b.worldZ, b.hex, n);
        expect(past + reach).toBeLessThanOrEqual(MAX_OFFSHORE_REACH + 1e-6);
        if (Math.abs(past + reach - MAX_OFFSHORE_REACH) < 1e-6) capped++;
      }
    }
    // The cap bites on some of the offshore boulders (they are shrunk to it), not on none.
    expect(capped).toBeGreaterThan(0);
  });

  it("stays clear of every water hex centre a ship could occupy by at least SHIP_HULL_CLEARANCE", () => {
    // A ship's hull reaches ~0.4 units from its hex centre.
    expect(SHIP_HULL_CLEARANCE).toBeGreaterThan(0.4);
    for (const b of boulders) {
      for (const [wx, wz] of waterCentresNear(b.hex, wrap)) {
        expect(Math.hypot(b.worldX - wx, b.worldZ - wz) - b.reach).toBeGreaterThanOrEqual(SHIP_HULL_CLEARANCE - 1e-6);
      }
    }
  });

  it("never shrinks a boulder below a visible size", () => {
    for (const b of boulders) expect(b.reach).toBeGreaterThan(0.05);
  });

  it("sits emergent boulders on the ground and submerged ones under the surface on the seabed", () => {
    let submerged = 0;
    for (const b of boulders) {
      const ground = field.sampleHeight(b.worldX, b.worldZ);
      const top = ROCK_VARIANT_REACH[b.variation.variant].top * b.variation.scale[1];
      if (b.submerged) {
        submerged++;
        expect(ground).toBeLessThan(SEA_LEVEL);
        // Its origin is on or in the seabed, never floating above it.
        expect(b.worldY).toBeLessThanOrEqual(ground + 1e-9);
        // Its crown is under the surface, within the crown-depth band.
        const crownDepth = SEA_LEVEL - (b.worldY + top);
        expect(crownDepth).toBeGreaterThanOrEqual(metresToUnits(SUBMERGED_CROWN_DEPTH_METRES[0]) - 1e-9);
        // (unless the seabed itself is already that deep and it stands on it).
        if (b.worldY !== ground) expect(crownDepth).toBeLessThanOrEqual(metresToUnits(SUBMERGED_CROWN_DEPTH_METRES[1]) + 1e-9);
      } else {
        // Emergent: on the ground at its centre, and poking out of the water.
        expect(b.worldY).toBeCloseTo(ground, 9);
        expect(b.worldY + top).toBeGreaterThan(SEA_LEVEL);
      }
    }
    expect(submerged).toBeGreaterThan(boulders.length * 0.1);
    expect(submerged).toBeLessThan(boulders.length * 0.6);
  });

  it("treats a boulder that straddles the waterline as emergent", () => {
    for (const b of boulders) {
      const top = ROCK_VARIANT_REACH[b.variation.variant].top * b.variation.scale[1];
      if (b.worldY + top > SEA_LEVEL) expect(b.submerged).toBe(false);
    }
  });

  it("colours each boulder by its cell's biome, darkened where it is wet", () => {
    let wet = 0;
    for (const b of boulders) {
      const biome = cellOf(b.hex).biome;
      expect(biome).toBeDefined();
      const dry = Math.abs(b.variation.tint - 1) <= 0.15 + 1e-9;
      if (b.coastDistance >= WET_BAND) {
        expect(dry).toBe(true);
      } else {
        // Wet: the tint is scaled down by up to WET_DARKENING.
        expect(b.variation.tint).toBeLessThanOrEqual(1.15 + 1e-9);
        expect(b.variation.tint).toBeGreaterThanOrEqual(0.85 * (1 - WET_DARKENING) - 1e-9);
        if (b.coastDistance <= 0) {
          expect(b.variation.tint).toBeLessThanOrEqual(1.15 * (1 - WET_DARKENING) + 1e-9);
          wet++;
        }
      }
    }
    expect(wet).toBeGreaterThan(0);
  });

  it("leaves the edge a pier faces clear", () => {
    // Ports are generated on beach (sand) cells, which get no boulders; give
    // them rock coasts so the rule is exercised.
    const rockPorts = cells.map((c) => (c.hasPort ? { ...c, biome: "ROCK" as const } : c));
    const portBoulders = shoreBoulders(rockPorts, field, wrap, seed);
    const ports = rockPorts.filter((c) => c.hasPort && c.decorations?.some((d) => d.type === "pier"));
    expect(ports.length).toBeGreaterThan(0);
    expect(portBoulders.some((b) => ports.some((p) => p.hex.q === b.hex.q && p.hex.r === b.hex.r))).toBe(true);
    for (const port of ports) {
      const pier = port.decorations!.find((d) => d.type === "pier")!;
      const dirX = Math.sin(pier.rotation);
      const dirZ = Math.cos(pier.rotation);
      const [cx, , cz] = hexToWorld(port.hex);
      for (const b of portBoulders.filter((b) => b.hex.q === port.hex.q && b.hex.r === port.hex.r)) {
        const dx = b.worldX - cx;
        const dz = b.worldZ - cz;
        const along = (dx * dirX + dz * dirZ) / Math.hypot(dx, dz);
        // Nothing within 30° of the pier's direction from the port centre.
        expect(along).toBeLessThan(Math.cos(Math.PI / 6));
      }
    }
  });

  it("respects the east–west wrap: a cell on the seam counts its neighbour across it as land", () => {
    // Two land cells on either side of the seam: the shared edge is not a coast, so no boulders on it.
    const width = 8;
    const w = createWrap(width);
    const land = (q: number, r: number): MapCell => ({
      hex: { q, r, s: -q - r },
      terrain: "island",
      hasPort: false,
      elevation: 3,
      biome: "ROCK",
    });
    const water = (q: number, r: number): MapCell => ({ hex: { q, r, s: -q - r }, terrain: "water", hasPort: false, elevation: 0 });
    const row: MapCell[] = [];
    for (let q = 0; q < width; q++) {
      for (let r = -4; r < 4; r++) {
        // Column 0 and the last column are land; the rest water (an island across the seam).
        row.push(q === 0 || q === width - 1 ? land(q, r - Math.floor(q / 2)) : water(q, r - Math.floor(q / 2)));
      }
    }
    const f = createTerrainHeightField(row, 7, { wrap: w, coastNoiseAmplitude: 0 });
    const wrapped = shoreBoulders(row, f, w, 7);
    const flat = shoreBoulders(row, createTerrainHeightField(row, 7, { coastNoiseAmplitude: 0 }), null, 7);
    expect(wrapped.length).toBeGreaterThan(0);
    // With the wrap, the seam edges are land-to-land and get nothing; without it they are coast.
    expect(wrapped.length).toBeLessThan(flat.length);
    // Column 0's west edges (midpoint x = −0.75) face the last column across the
    // seam, so they get boulders only without the wrap (the top cell's north-west
    // edge faces off the map's top row and is a real coast either way).
    const col0 = (b: ShoreBoulder) => b.hex.q === 0 && b.hex.r > -4;
    for (const b of wrapped.filter(col0)) expect(b.worldX).toBeGreaterThan(-0.7);
    expect(flat.filter(col0).some((b) => b.worldX < -0.7)).toBe(true);
  });

  it("places nothing on a map without coast", () => {
    const sea: ShoreField = { sampleHeight: () => -1, sampleCoastDistance: () => -4 };
    expect(shoreBoulders(cells.filter((c) => c.terrain !== "island"), sea, wrap, seed)).toEqual([]);
  });
});
