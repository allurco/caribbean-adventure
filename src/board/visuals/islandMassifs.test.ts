import { describe, it, expect } from "vitest";
import type { Elevation, MapCell } from "../../game/types";
import { hexGrid, hexToWorld, neighbors } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createTerrainHeightField, ELEVATION_HEIGHTS } from "./terrainHeightField";
import { VIEW_EYE_HEIGHT, VIEW_LINE_SLOPE, MASSIF_PORT_CLEARANCE, placeMassifs, viewLineCap } from "./islandMassifs";

const key = (q: number, r: number) => `${q},${r}`;

/** Seeded PRNG (mulberry32), as the field uses. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A hex map of `radius` that is all water except the given land cells. */
function buildMap(radius: number, land: Record<string, Elevation>, port?: string): MapCell[] {
  return hexGrid(radius).map((h) => {
    const elevation = land[key(h.q, h.r)];
    return elevation
      ? { hex: h, terrain: "island", hasPort: key(h.q, h.r) === port, elevation }
      : { hex: h, terrain: "water", hasPort: false, elevation: 0 };
  });
}

/** Volcano island: mountain centre, jungle ring, beach ring (like mapGenerator). */
function volcanoIsland(): Record<string, Elevation> {
  const land: Record<string, Elevation> = {};
  for (const h of hexGrid(2)) {
    const d = Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.s));
    land[key(h.q, h.r)] = d === 0 ? 3 : d === 1 ? 2 : 1;
  }
  return land;
}

const SEED = 1234;
const SEEDS = [1, 2, 3, 4, 5];

describe("island massifs (#83 prototype)", () => {
  it("leaves the field untouched with the flag off", () => {
    const cells = generateMap(getMapPreset("small"), 1);
    const plain = createTerrainHeightField(cells, SEED);
    const off = createTerrainHeightField(cells, SEED, { massifs: false });
    for (let x = 0; x <= 30; x += 0.53) {
      for (let z = 0; z <= 30; z += 0.47) expect(off.sampleHeight(x, z)).toBe(plain.sampleHeight(x, z));
    }
  });

  it("raises the ground somewhere on a volcano island with the flag on", () => {
    const cells = buildMap(5, volcanoIsland());
    const off = createTerrainHeightField(cells, SEED);
    const on = createTerrainHeightField(cells, SEED, { massifs: true });
    let maxOff = -Infinity;
    let maxOn = -Infinity;
    for (let x = -4; x <= 4; x += 0.1) {
      for (let z = -4; z <= 4; z += 0.1) {
        maxOff = Math.max(maxOff, off.sampleHeight(x, z));
        maxOn = Math.max(maxOn, on.sampleHeight(x, z));
      }
    }
    expect(maxOn).toBeGreaterThan(maxOff + 0.2);
  });

  it("keeps the coast at sea level: exactly 0 on every land/water edge midpoint without coast noise", () => {
    const cells = buildMap(4, volcanoIsland());
    const field = createTerrainHeightField(cells, SEED, { coastNoiseAmplitude: 0, massifs: true });
    const byKey = new Map(cells.map((c) => [key(c.hex.q, c.hex.r), c]));
    let edges = 0;
    for (const cell of cells) {
      if (cell.terrain !== "island") continue;
      for (const n of neighbors(cell.hex)) {
        const other = byKey.get(key(n.q, n.r));
        if (!other || other.terrain === "island") continue;
        const [ax, , az] = hexToWorld(cell.hex);
        const [bx, , bz] = hexToWorld(n);
        expect(field.sampleHeight((ax + bx) / 2, (az + bz) / 2)).toBeCloseTo(0, 9);
        edges++;
      }
    }
    expect(edges).toBeGreaterThan(0);
  });

  it("keeps the sea below sea level and the coast crossing where it was on generated maps", () => {
    for (const seed of SEEDS) {
      const cells = generateMap(getMapPreset("small"), seed);
      const field = createTerrainHeightField(cells, SEED, { massifs: true });
      for (const cell of cells) {
        const [x, , z] = hexToWorld(cell.hex);
        if (cell.terrain !== "island") expect(field.sampleHeight(x, z)).toBeLessThan(0);
        else expect(field.sampleHeight(x, z)).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every port hex exactly as the flag-off field has it, within the port clearance", () => {
    for (const seed of SEEDS) {
      const cells = generateMap(getMapPreset("small"), seed);
      const off = createTerrainHeightField(cells, SEED);
      const on = createTerrainHeightField(cells, SEED, { massifs: true });
      let ports = 0;
      for (const cell of cells) {
        if (!cell.hasPort) continue;
        ports++;
        const [px, , pz] = hexToWorld(cell.hex);
        const centre = on.sampleHeight(px, pz);
        // The beach band: the beach's own height, or a little over it where a higher neighbour pulls it up.
        expect(centre).toBeGreaterThan(0.1);
        expect(centre).toBeLessThan(ELEVATION_HEIGHTS[1] + 0.3);
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
          for (let r = 0; r <= 0.7; r += 0.1) {
            const x = px + Math.cos(a) * r;
            const z = pz + Math.sin(a) * r;
            expect(on.sampleHeight(x, z)).toBeCloseTo(off.sampleHeight(x, z), 9);
          }
        }
      }
      expect(ports).toBeGreaterThan(0);
    }
    expect(MASSIF_PORT_CLEARANCE).toBeGreaterThan(0.7);
  });

  it("never lifts the ground over a port's view line where the flag-off field was under it", () => {
    // The massif bodies are capped under the line; the shore ramp pulled in
    // beside one can still lift the relief under it by a few hundredths.
    const SHORE_PULL_TOLERANCE = 0.05;
    for (const seed of SEEDS) {
      const cells = generateMap(getMapPreset("small"), seed);
      const off = createTerrainHeightField(cells, SEED);
      const on = createTerrainHeightField(cells, SEED, { massifs: true });
      for (const cell of cells) {
        if (!cell.hasPort) continue;
        const [px, , pz] = hexToWorld(cell.hex);
        // The line from the port's beach height up towards the camera (+z), over the port and a hex either side.
        for (let dx = -1; dx <= 1; dx += 0.25) {
          for (let s = 0; s <= 6; s += 0.05) {
            const line = VIEW_EYE_HEIGHT + s * VIEW_LINE_SLOPE;
            const over = Math.max(0, on.sampleHeight(px + dx, pz + s) - line);
            const overBefore = Math.max(0, off.sampleHeight(px + dx, pz + s) - line);
            expect(over).toBeLessThanOrEqual(overBefore + SHORE_PULL_TOLERANCE);
          }
        }
      }
    }
  });

  it("caps every massif in a port's cone under its view line, and the field with it, on a synthetic island", () => {
    // Port on the north beach (r = -2 is north: smaller z), mountain core south of it.
    const land = volcanoIsland();
    const cells = buildMap(5, land, key(0, -2));
    const [px, , pz] = hexToWorld({ q: 0, r: -2, s: 2 });
    const massifs = placeMassifs(cells, mulberry32(SEED));
    expect(massifs.length).toBeGreaterThanOrEqual(2);
    let inCone = 0;
    for (const m of massifs) {
      const cap = viewLineCap(m, [{ x: px, z: pz }]);
      if (cap === null) continue;
      inCone++;
      expect(m.top).toBeLessThanOrEqual(cap + 1e-9);
    }
    expect(inCone).toBeGreaterThan(0);
    const field = createTerrainHeightField(cells, SEED, { massifs: true, coastNoiseAmplitude: 0 });
    // Past the port hex itself (whose beach the jungle ring pulls a little over the eye height).
    for (let s = 1; s <= 5; s += 0.05) {
      const line = VIEW_EYE_HEIGHT + s * VIEW_LINE_SLOPE;
      expect(field.sampleHeight(px, pz + s)).toBeLessThan(line + 1e-9);
    }
  });
});
