import { describe, it, expect } from "vitest";
import type { MapCell } from "../../game/types";
import { hexGrid } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import { buildLandMesh, LAND_MESH_SKIRT_DEPTH } from "./landMesh";

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
    expect(elapsed).toBeLessThan(2000);
  });
});
