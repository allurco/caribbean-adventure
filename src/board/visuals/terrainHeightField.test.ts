import { describe, it, expect } from "vitest";
import type { Elevation, MapCell } from "../../game/types";
import { hex, hexGrid, hexToWorld, neighbors } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import {
  createTerrainHeightField,
  terrainSeedFromCells,
  ELEVATION_HEIGHTS,
  COAST_NOISE_AMPLITUDE,
} from "./terrainHeightField";
import { LAND_MESH_SPACING } from "./landMesh";

const key = (q: number, r: number) => `${q},${r}`;

/** A hex map of `radius` that is all water except the given land cells. */
function buildMap(radius: number, land: Record<string, Elevation>): MapCell[] {
  return hexGrid(radius).map((h) => {
    const elevation = land[key(h.q, h.r)];
    return elevation
      ? { hex: h, terrain: "island", hasPort: false, elevation }
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

function centre(q: number, r: number): [number, number] {
  const [x, , z] = hexToWorld(hex(q, r));
  return [x, z];
}

function isLand(cell: MapCell | undefined): boolean {
  return cell?.terrain === "island";
}

const SEED = 1234;

describe("terrainHeightField", () => {
  describe("determinism", () => {
    it("returns identical heights for the same cells and seed", () => {
      const cells = buildMap(5, volcanoIsland());
      const a = createTerrainHeightField(cells, SEED);
      const b = createTerrainHeightField(cells, SEED);
      for (let x = -6; x <= 6; x += 0.37) {
        for (let z = -6; z <= 6; z += 0.41) {
          expect(a.sampleHeight(x, z)).toBe(b.sampleHeight(x, z));
        }
      }
    });

    it("perturbs the coastline differently for a different seed", () => {
      const cells = buildMap(5, volcanoIsland());
      const a = createTerrainHeightField(cells, SEED);
      const b = createTerrainHeightField(cells, SEED + 1);
      let differs = false;
      for (let x = -6; x <= 6 && !differs; x += 0.37) {
        for (let z = -6; z <= 6; z += 0.41) {
          if (a.sampleHeight(x, z) !== b.sampleHeight(x, z)) {
            differs = true;
            break;
          }
        }
      }
      expect(differs).toBe(true);
    });

    it("derives a stable seed from the cells", () => {
      const cells = generateMap(12, 99);
      expect(terrainSeedFromCells(cells)).toBe(terrainSeedFromCells(generateMap(12, 99)));
      expect(terrainSeedFromCells(cells)).not.toBe(terrainSeedFromCells(generateMap(12, 100)));
    });
  });

  describe("continuity across land hex edges", () => {
    /** Max height jump and min height along the segment between two hex centres. */
    function profile(
      field: ReturnType<typeof createTerrainHeightField>,
      from: [number, number],
      to: [number, number],
      steps = 400
    ) {
      let maxJump = 0;
      let minHeight = Infinity;
      let prev = field.sampleHeight(from[0], from[1]);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const h = field.sampleHeight(
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t
        );
        maxJump = Math.max(maxJump, Math.abs(h - prev));
        minHeight = Math.min(minHeight, h);
        prev = h;
      }
      return { maxJump, minHeight };
    }

    it("has no seam or dip to sea level between two adjacent beach hexes", () => {
      const cells = buildMap(4, { [key(0, 0)]: 1, [key(1, 0)]: 1 });
      const field = createTerrainHeightField(cells, SEED);
      const { maxJump, minHeight } = profile(field, centre(0, 0), centre(1, 0));
      // Step is ~0.004 world units; a seam would show up as a jump.
      expect(maxJump).toBeLessThan(0.01);
      expect(minHeight).toBeGreaterThan(0.05);
    });

    it("blends smoothly from mountain to jungle without dipping", () => {
      const cells = buildMap(5, volcanoIsland());
      const field = createTerrainHeightField(cells, SEED);
      const { maxJump, minHeight } = profile(field, centre(0, 0), centre(1, 0));
      expect(maxJump).toBeLessThan(0.02);
      const jungle = field.sampleHeight(...centre(1, 0));
      expect(minHeight).toBeGreaterThanOrEqual(jungle - 0.05);
    });

    it("is continuous across every land-land edge of a generated map", () => {
      const cells = generateMap(12, 7);
      const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
      const byKey = new Map(cells.map((c) => [key(c.hex.q, c.hex.r), c]));
      let pairs = 0;
      for (const cell of cells) {
        if (!isLand(cell)) continue;
        for (const n of neighbors(cell.hex)) {
          if (!isLand(byKey.get(key(n.q, n.r)))) continue;
          const { maxJump, minHeight } = profile(
            field,
            centre(cell.hex.q, cell.hex.r),
            centre(n.q, n.r),
            100
          );
          expect(maxJump).toBeLessThan(0.06);
          expect(minHeight).toBeGreaterThan(0);
          pairs++;
        }
      }
      expect(pairs).toBeGreaterThan(0);
    });
  });

  describe("height ordered by elevation", () => {
    it("uses increasing target heights for beach, jungle, mountain", () => {
      expect(ELEVATION_HEIGHTS[1]).toBeLessThan(ELEVATION_HEIGHTS[2]);
      expect(ELEVATION_HEIGHTS[2]).toBeLessThan(ELEVATION_HEIGHTS[3]);
    });

    it("puts mountain centre above jungle centre above beach centre", () => {
      const cells = buildMap(5, volcanoIsland());
      const field = createTerrainHeightField(cells, SEED);
      const mountain = field.sampleHeight(...centre(0, 0));
      const jungle = field.sampleHeight(...centre(1, 0));
      const beach = field.sampleHeight(...centre(2, 0));
      expect(mountain).toBeGreaterThan(jungle);
      expect(jungle).toBeGreaterThan(beach);
      expect(beach).toBeGreaterThan(0);
    });

    it("orders every cell centre by elevation on generated maps", () => {
      for (const seed of [1, 42, 2024]) {
        const cells = generateMap(getMapPreset("medium").radius, seed);
        const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
        const heights: Record<number, number[]> = { 1: [], 2: [], 3: [] };
        for (const cell of cells) {
          if (!isLand(cell)) continue;
          heights[cell.elevation].push(field.sampleHeight(...centre(cell.hex.q, cell.hex.r)));
        }
        expect(heights[1].length).toBeGreaterThan(0);
        expect(Math.min(...heights[1])).toBeGreaterThan(0);
        if (heights[2].length > 0) {
          expect(Math.min(...heights[2])).toBeGreaterThan(Math.max(...heights[1]));
        }
        if (heights[3].length > 0 && heights[2].length > 0) {
          expect(Math.min(...heights[3])).toBeGreaterThan(Math.max(...heights[2]));
        }
      }
    });
  });

  describe("coastline and sea", () => {
    it("is exactly sea level on the land/water hex edge without coast noise", () => {
      const cells = buildMap(4, volcanoIsland());
      const field = createTerrainHeightField(cells, SEED, { coastNoiseAmplitude: 0 });
      // Midpoint of the edge between beach (2,0) and water (3,0).
      const [ax, az] = centre(2, 0);
      const [bx, bz] = centre(3, 0);
      expect(field.sampleHeight((ax + bx) / 2, (az + bz) / 2)).toBeCloseTo(0, 9);
      expect(field.sampleCoastDistance((ax + bx) / 2, (az + bz) / 2)).toBeCloseTo(0, 9);
    });

    it("crosses sea level near every land/water hex edge, at height ~0", () => {
      const cells = buildMap(5, volcanoIsland());
      const field = createTerrainHeightField(cells, SEED);
      const byKey = new Map(cells.map((c) => [key(c.hex.q, c.hex.r), c]));
      let edges = 0;
      for (const cell of cells) {
        if (!isLand(cell)) continue;
        for (const n of neighbors(cell.hex)) {
          const other = byKey.get(key(n.q, n.r));
          if (!other || isLand(other)) continue;
          const [ax, az] = centre(cell.hex.q, cell.hex.r);
          const [bx, bz] = centre(n.q, n.r);
          const at = (t: number) => field.sampleHeight(ax + (bx - ax) * t, az + (bz - az) * t);
          expect(at(0)).toBeGreaterThan(0);
          expect(at(1)).toBeLessThan(0);
          // Bisect for the shoreline crossing.
          let lo = 0;
          let hi = 1;
          for (let i = 0; i < 50; i++) {
            const mid = (lo + hi) / 2;
            if (at(mid) > 0) lo = mid;
            else hi = mid;
          }
          const tCross = (lo + hi) / 2;
          expect(Math.abs(at(tCross))).toBeLessThan(1e-6);
          // The shore sits within the noise amplitude of the hex edge (t = 0.5).
          const centreSpacing = Math.sqrt(3);
          expect(Math.abs(tCross - 0.5) * centreSpacing).toBeLessThanOrEqual(
            COAST_NOISE_AMPLITUDE + 1e-6
          );
          edges++;
        }
      }
      expect(edges).toBe(12 * 2 + 6); // 18-hex outline of a radius-2 island
    });

    it("is negative at every water cell centre and in open ocean", () => {
      const cells = generateMap(12, 3);
      const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
      for (const cell of cells) {
        if (isLand(cell)) continue;
        expect(field.sampleHeight(...centre(cell.hex.q, cell.hex.r))).toBeLessThan(0);
      }
      expect(field.sampleHeight(500, -500)).toBeLessThan(0);
    });

    it("gets deeper moving away from the shore", () => {
      const cells = buildMap(6, { [key(0, 0)]: 1 });
      const field = createTerrainHeightField(cells, SEED);
      // Coast distance saturates 2 units offshore; compare inside that shelf.
      const near = field.sampleHeight(...centre(1, 0));
      const far = field.sampleHeight(...centre(4, 0));
      expect(near).toBeLessThan(0);
      expect(far).toBeLessThan(near);
    });

    it("flags open water away from land as not near land", () => {
      const cells = generateMap(12, 3);
      const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
      let far = 0;
      for (let x = -20; x <= 20; x += 0.13) {
        for (let z = -20; z <= 20; z += 0.13) {
          if (field.isNearLand(x, z)) continue;
          expect(field.sampleCoastDistance(x, z)).toBeLessThanOrEqual(-(1 - COAST_NOISE_AMPLITUDE));
          far++;
        }
      }
      expect(far).toBeGreaterThan(1000);
    });

    it("treats reef cells as water", () => {
      const cells = buildMap(3, { [key(0, 0)]: 1 }).map((c) =>
        c.hex.q === 2 && c.hex.r === 0 ? { ...c, terrain: "reef" as const } : c
      );
      const field = createTerrainHeightField(cells, SEED);
      expect(field.sampleHeight(...centre(2, 0))).toBeLessThan(0);
    });
  });

  describe("interior relief", () => {
    /** A radius-3 island where every land hex has the same elevation. */
    function flatIsland(elevation: Elevation): MapCell[] {
      const land: Record<string, Elevation> = {};
      for (const h of hexGrid(3)) land[key(h.q, h.r)] = elevation;
      return buildMap(7, land);
    }

    /** Std dev of (height − height without relief) over the island interior. */
    function reliefSpread(elevation: Elevation): number {
      const cells = flatIsland(elevation);
      const field = createTerrainHeightField(cells, SEED);
      const smooth = createTerrainHeightField(cells, SEED, { reliefScale: 0 });
      const residuals: number[] = [];
      for (let x = -3; x <= 3; x += 0.1) {
        for (let z = -3; z <= 3; z += 0.1) {
          residuals.push(field.sampleHeight(x, z) - smooth.sampleHeight(x, z));
        }
      }
      const mean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
      const variance = residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / residuals.length;
      return Math.sqrt(variance);
    }

    it("grows with elevation: slight on beach, moderate in jungle, strong on mountains", () => {
      const beach = reliefSpread(1);
      const jungle = reliefSpread(2);
      const mountain = reliefSpread(3);
      expect(beach).toBeGreaterThan(0);
      expect(jungle).toBeGreaterThan(beach * 2);
      expect(mountain).toBeGreaterThan(jungle * 2);
      // Mountains should read as peaks, not a faint texture.
      expect(mountain).toBeGreaterThan(0.08);
    });

    it("vanishes at the coast, with zero slope", () => {
      const cells = generateMap(12, 5);
      const seed = terrainSeedFromCells(cells);
      const field = createTerrainHeightField(cells, seed);
      const smooth = createTerrainHeightField(cells, seed, { reliefScale: 0 });
      let nearShore = 0;
      for (let x = -20; x <= 20; x += 0.09) {
        for (let z = -20; z <= 20; z += 0.09) {
          const d = field.sampleCoastDistance(x, z);
          const residual = Math.abs(field.sampleHeight(x, z) - smooth.sampleHeight(x, z));
          if (d <= 0) {
            expect(residual).toBe(0);
          } else if (d < 0.05) {
            // Fades like d², so it is negligible this close to the shore.
            expect(residual).toBeLessThan(0.005);
            nearShore++;
          }
        }
      }
      expect(nearShore).toBeGreaterThan(100);
    });

    it("is the same for the same seed and changes with the seed", () => {
      const cells = flatIsland(3);
      const a = createTerrainHeightField(cells, SEED);
      const b = createTerrainHeightField(cells, SEED);
      const c = createTerrainHeightField(cells, SEED + 1);
      expect(a.sampleHeight(0.3, 0.7)).toBe(b.sampleHeight(0.3, 0.7));
      expect(a.sampleHeight(0.3, 0.7)).not.toBe(c.sampleHeight(0.3, 0.7));
    });
  });

  describe("bounds", () => {
    it("covers every cell", () => {
      const cells = buildMap(4, volcanoIsland());
      const { bounds } = createTerrainHeightField(cells, SEED);
      for (const cell of cells) {
        const [x, z] = centre(cell.hex.q, cell.hex.r);
        expect(x).toBeGreaterThan(bounds.minX);
        expect(x).toBeLessThan(bounds.maxX);
        expect(z).toBeGreaterThan(bounds.minZ);
        expect(z).toBeLessThan(bounds.maxZ);
      }
    });
  });

  describe("performance", () => {
    it("benchmark: builds and densely samples the largest map quickly", () => {
      const { radius } = getMapPreset("large");
      const cells = generateMap(radius, 31337);

      const start = performance.now();
      const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
      const built = performance.now();
      // Sample at the land mesh's resolution.
      const { minX, maxX, minZ, maxZ } = field.bounds;
      let samples = 0;
      let sink = 0;
      for (let z = minZ; z <= maxZ; z += LAND_MESH_SPACING * (Math.sqrt(3) / 2)) {
        for (let x = minX; x <= maxX; x += LAND_MESH_SPACING) {
          sink += field.sampleHeight(x, z);
          samples++;
        }
      }
      const elapsed = performance.now() - start;

      console.log(
        `Height field, large map (radius ${radius}, ${cells.length} cells): ` +
          `build ${(built - start).toFixed(1)}ms, ${samples} samples in ${elapsed.toFixed(1)}ms`
      );
      expect(Number.isFinite(sink)).toBe(true);
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
