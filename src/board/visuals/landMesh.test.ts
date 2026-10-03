import { describe, it, expect } from "vitest";
import type { MapCell } from "../../game/types";
import { hexGrid } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import {
  buildLandMesh,
  landFaceColor,
  LAND_MESH_SKIRT_DEPTH,
  LAND_MESH_SPACING,
  type LandMeshColors,
} from "./landMesh";

function singleIsland(): MapCell[] {
  return hexGrid(4).map((h) =>
    h.q === 0 && h.r === 0
      ? { hex: h, terrain: "island", hasPort: false, elevation: 1 }
      : { hex: h, terrain: "water", hasPort: false, elevation: 0 }
  );
}

/** Island by hex distance from the centre: elevation per ring, water beyond. */
function ringIsland(elevations: readonly MapCell["elevation"][]): MapCell[] {
  return hexGrid(elevations.length + 2).map((h): MapCell => {
    const ring = Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.s));
    return ring < elevations.length
      ? { hex: h, terrain: "island", hasPort: false, elevation: elevations[ring] }
      : { hex: h, terrain: "water", hasPort: false, elevation: 0 };
  });
}

/** Mountain peak, jungle ring, beach ring. */
const mountainIsland = () => ringIsland([3, 2, 1]);
/** A jungle hollow inside a ring of mountains. */
const hollowIsland = () => ringIsland([2, 3, 1]);

/**
 * Test palette that keeps the bands apart by channel: rock alone has blue,
 * dry sand has r = g, jungle g only, highland r > g, wet sand r only.
 */
const CHANNEL_COLORS: LandMeshColors = {
  wetSand: [1, 0, 0],
  drySand: [1, 1, 0],
  jungle: [0, 1, 0],
  highland: [1, 0.5, 0],
  rock: [0, 0, 1],
};

function faceRgb(colors: Float32Array, t: number): [number, number, number] {
  return [colors[t * 9], colors[t * 9 + 1], colors[t * 9 + 2]];
}

/** Centroid, mean height and the y of the unit face normal. */
function faceGeometry(p: Float32Array, t: number) {
  const o = t * 9;
  const ux = p[o + 3] - p[o];
  const uy = p[o + 4] - p[o + 1];
  const uz = p[o + 5] - p[o + 2];
  const vx = p[o + 6] - p[o];
  const vy = p[o + 7] - p[o + 1];
  const vz = p[o + 8] - p[o + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return {
    x: (p[o] + p[o + 3] + p[o + 6]) / 3,
    z: (p[o + 2] + p[o + 5] + p[o + 8]) / 3,
    height: (p[o + 1] + p[o + 4] + p[o + 7]) / 3,
    normalY: ny / Math.hypot(nx, ny, nz),
  };
}

describe("landFaceColor", () => {
  const flat = { height: 0.3, normalY: 1, noise: 0, cavity: 0 };

  it("is wet sand just above the waterline", () => {
    expect(landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.01 })).toEqual([1, 0, 0]);
  });

  it("blends beach to jungle to highland by height", () => {
    expect(landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.3 })).toEqual([1, 1, 0]);
    expect(landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.75 })).toEqual([0, 1, 0]);
    expect(landFaceColor(CHANNEL_COLORS, { ...flat, height: 1.6 })).toEqual([1, 0.5, 0]);
  });

  it("is rock on steep faces whatever the height", () => {
    for (const height of [0.3, 0.75, 1.6]) {
      expect(landFaceColor(CHANNEL_COLORS, { ...flat, height, normalY: 0.3 })).toEqual([0, 0, 1]);
    }
  });

  it("moves band boundaries with the noise", () => {
    const low = landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.48, noise: -1 });
    const high = landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.48, noise: 1 });
    expect(low[0]).toBeGreaterThan(high[0] + 0.5);
  });

  it("darkens hollows but not crests", () => {
    const open = landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.75 });
    const hollow = landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.75, cavity: 0.2 });
    const crest = landFaceColor(CHANNEL_COLORS, { ...flat, height: 0.75, cavity: -0.2 });
    expect(hollow[1]).toBeLessThan(open[1] * 0.95);
    expect(hollow[1]).toBeGreaterThan(open[1] * 0.5);
    expect(crest).toEqual(open);
  });
});

describe("buildLandMesh", () => {
  it("places every vertex on the height field", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const { positions } = buildLandMesh(field);
    expect(positions.length).toBeGreaterThan(0);
    for (let i = 0; i < positions.length; i += 3) {
      expect(positions[i + 1]).toBeCloseTo(field.sampleHeight(positions[i], positions[i + 2]), 5);
    }
  });

  it("emits one colour per vertex and whole triangles", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const { positions, colors, triangleCount } = buildLandMesh(field);
    expect(positions.length).toBe(triangleCount * 9);
    expect(colors.length).toBe(positions.length);
  });

  it("colours a lone beach island with wet and dry sand only", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const { positions, colors, triangleCount } = buildLandMesh(field, { colors: CHANNEL_COLORS });
    let wet = 0;
    let dry = 0;
    for (let t = 0; t < triangleCount; t++) {
      const [r, g, b] = faceRgb(colors, t);
      // At most a trace of rock (b) on the steepest shore faces, and no jungle
      // (g without r).
      expect(b / (r + g + b)).toBeLessThan(0.05);
      expect(r).toBeGreaterThanOrEqual(g - 1e-6);
      const { height } = faceGeometry(positions, t);
      if (height > 0 && g === 0 && b === 0) wet++;
      if (g > 0 && b === 0 && Math.abs(r - g) < 1e-6) dry++;
    }
    expect(wet).toBeGreaterThan(0);
    expect(dry).toBeGreaterThan(0);
  });

  it("puts wet sand on faces just above the waterline", () => {
    const field = createTerrainHeightField(mountainIsland(), 11);
    const { positions, colors, triangleCount } = buildLandMesh(field, { colors: CHANNEL_COLORS });
    let checked = 0;
    for (let t = 0; t < triangleCount; t++) {
      const { height, normalY } = faceGeometry(positions, t);
      if (height <= 0 || height > 0.02 || normalY < 0.85) continue;
      const [r, g, b] = faceRgb(colors, t);
      expect(g).toBe(0);
      expect(b).toBe(0);
      expect(r).toBeGreaterThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("puts rock on steep faces even at mid height", () => {
    const cells = generateMap(12, 7);
    const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    const { positions, colors, triangleCount } = buildLandMesh(field, { colors: CHANNEL_COLORS });
    let checked = 0;
    for (let t = 0; t < triangleCount; t++) {
      const { height, normalY } = faceGeometry(positions, t);
      // Steeper than ~63°.
      if (height < 0.3 || height > 1 || normalY > 0.45) continue;
      const [r, g, b] = faceRgb(colors, t);
      expect(b / (r + g + b)).toBeGreaterThan(0.95);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("does not paint flat high ground as rock", () => {
    const field = createTerrainHeightField(mountainIsland(), 11);
    const { positions, colors, triangleCount } = buildLandMesh(field, { colors: CHANNEL_COLORS });
    let checked = 0;
    for (let t = 0; t < triangleCount; t++) {
      const { height, normalY } = faceGeometry(positions, t);
      if (height < 1.4 || normalY < 0.95) continue;
      const [r, g, b] = faceRgb(colors, t);
      expect(b).toBe(0);
      // Highland (r = 2g), not jungle (r = 0).
      expect(r).toBeGreaterThan(g);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("breaks the beach/jungle boundary with noise instead of a height contour", () => {
    const cells = generateMap(12, 7);
    const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    const { positions, colors, triangleCount } = buildLandMesh(field, { colors: CHANNEL_COLORS });
    // Flat faces at (almost) the same height: a contour would give them the
    // same sand/jungle mix; noise spreads it.
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < triangleCount; t++) {
      const { height, normalY } = faceGeometry(positions, t);
      if (height < 0.48 || height > 0.49 || normalY < 0.95) continue;
      const [r, g] = faceRgb(colors, t);
      const sand = r / g; // drySand (1,1,0) vs jungle (0,1,0)
      lo = Math.min(lo, sand);
      hi = Math.max(hi, sand);
    }
    expect(hi - lo).toBeGreaterThan(0.4);
  });

  it("darkens faces in a hollow", () => {
    const field = createTerrainHeightField(hollowIsland(), 3, { reliefScale: 0 });
    const lit = buildLandMesh(field, { colors: CHANNEL_COLORS, occlusion: 0 });
    const shaded = buildLandMesh(field, { colors: CHANNEL_COLORS });
    expect(shaded.positions).toEqual(lit.positions);
    // The face nearest the middle of the ring of mountains.
    let best = -1;
    let bestDist = Infinity;
    for (let t = 0; t < lit.triangleCount; t++) {
      const { x, z } = faceGeometry(lit.positions, t);
      const d = Math.hypot(x, z);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    const before = faceRgb(lit.colors, best);
    const after = faceRgb(shaded.colors, best);
    expect(after[1]).toBeLessThan(before[1] * 0.95);
  });

  it("winds every triangle to face up", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const { positions } = buildLandMesh(field);
    for (let i = 0; i < positions.length; i += 9) {
      const ux = positions[i + 3] - positions[i];
      const uz = positions[i + 5] - positions[i + 2];
      const vx = positions[i + 6] - positions[i];
      const vz = positions[i + 8] - positions[i + 2];
      // y of cross(u, v), ignoring height: positive means counter-clockwise from above.
      expect(uz * vx - ux * vz).toBeGreaterThan(0);
    }
  });

  it("only covers land and the shallow skirt around it", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const { positions } = buildLandMesh(field);
    for (let i = 0; i < positions.length; i += 9) {
      const top = Math.max(positions[i + 1], positions[i + 4], positions[i + 7]);
      expect(top).toBeGreaterThan(-LAND_MESH_SKIRT_DEPTH);
    }
    // A single hex island is small: nothing far from the origin.
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.hypot(positions[i], positions[i + 2])).toBeLessThan(3);
    }
  });

  it("produces nothing for an all-water map", () => {
    const cells: MapCell[] = hexGrid(3).map((h) => ({
      hex: h,
      terrain: "water",
      hasPort: false,
      elevation: 0,
    }));
    const { triangleCount } = buildLandMesh(createTerrainHeightField(cells, 1));
    expect(triangleCount).toBe(0);
  });

  it("samples finely enough to resolve interior relief", () => {
    expect(LAND_MESH_SPACING).toBeLessThanOrEqual(0.15);
  });

  it("skipping open water yields exactly the full-lattice mesh", () => {
    const cells = generateMap(12, 7);
    const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    const fast = buildLandMesh(field);
    const full = buildLandMesh(field, { skipOpenWater: false });
    expect(fast.triangleCount).toBeGreaterThan(0);
    expect(fast.triangleCount).toBe(full.triangleCount);
    expect(fast.positions).toEqual(full.positions);
    expect(fast.colors).toEqual(full.colors);
  });

  it("benchmark: builds the land mesh for the largest map quickly", () => {
    const { radius } = getMapPreset("large");
    const cells = generateMap(radius, 31337);
    const start = performance.now();
    const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    const { triangleCount } = buildLandMesh(field);
    const elapsed = performance.now() - start;
    console.log(
      `Land mesh, large map (radius ${radius}): ${triangleCount} triangles in ${elapsed.toFixed(1)}ms`
    );
    expect(triangleCount).toBeGreaterThan(0);
    // One-time build; target is well under 200 ms, with headroom for slow CI.
    expect(elapsed).toBeLessThan(300);
  });
});
