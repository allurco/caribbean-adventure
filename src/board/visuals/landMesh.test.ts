import { describe, it, expect } from "vitest";
import type { MapCell } from "../../game/types";
import { hexGrid } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import { buildLandMesh, LAND_MESH_SKIRT_DEPTH, LAND_MESH_SPACING } from "./landMesh";

function singleIsland(): MapCell[] {
  return hexGrid(4).map((h) =>
    h.q === 0 && h.r === 0
      ? { hex: h, terrain: "island", hasPort: false, elevation: 1 }
      : { hex: h, terrain: "water", hasPort: false, elevation: 0 }
  );
}

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

  it("colours faces from the given palette", () => {
    const field = createTerrainHeightField(singleIsland(), 5);
    const sand = [0.9, 0.1, 0.1] as const;
    const wet = [0.1, 0.1, 0.9] as const;
    const { positions, colors } = buildLandMesh(field, {
      colors: { drySand: sand, wetSand: wet, jungle: [0, 1, 0], highlandRock: [0, 0, 0] },
    });
    // A lone beach island is only dry or wet sand; each face is its base colour
    // times a small brightness jitter, so the hue ratios survive.
    for (let i = 0; i < colors.length; i += 9) {
      const height = (positions[i + 1] + positions[i + 4] + positions[i + 7]) / 3;
      const base = height <= 0 ? wet : sand;
      const scale = colors[i] / base[0];
      expect(scale).toBeGreaterThan(0.9);
      expect(scale).toBeLessThan(1.1);
      expect(colors[i + 1]).toBeCloseTo(base[1] * scale, 5);
      expect(colors[i + 2]).toBeCloseTo(base[2] * scale, 5);
    }
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
