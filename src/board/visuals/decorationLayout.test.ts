import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset, type MapSizeId } from "../../game/mapConfig";
import { createWrap, hexToWorld } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { decorationLayout } from "./decorationLayout";
import { sharedTerrainField } from "./sharedTerrainField";
import { landSurface } from "./landMesh";
import { pierOrigin } from "./pierPlacement";

/** A few generated maps: every small seed the screenshots use, and a medium one. */
const SAMPLES: readonly [MapSizeId, number][] = [
  ["small", 1],
  ["small", 2],
  ["small", 3],
  ["small", 4],
  ["small", 5],
  ["small", 6],
  ["medium", 1],
  ["medium", 2],
];

const pierRotation = (cell: MapCell) => (cell.decorations ?? []).find((d) => d.type === "pier")?.rotation;
const near = (a: { x: number; z: number }, b: { worldX: number; worldZ: number }) => Math.hypot(a.x - b.worldX, a.z - b.worldZ) < 1e-9;

describe("decorationLayout", () => {
  it("starts every drawn pier where its quay and the settlement's pier-root reserve expect it: on the drawn land surface (#59)", () => {
    let ports = 0;
    let movedBySurface = 0;
    for (const [size, seed] of SAMPLES) {
      const preset = getMapPreset(size);
      const wrap = createWrap(preset.columns);
      const cells = generateMap(preset, seed, wrap);
      const layout = decorationLayout(cells, wrap);
      const field = sharedTerrainField(cells, wrap);
      const drawn = landSurface(field);
      for (const cell of cells) {
        const rotation = pierRotation(cell);
        if (!cell.hasPort || rotation === undefined) continue;
        ports++;
        const [x, , z] = hexToWorld(cell.hex);
        const expected = pierOrigin(drawn, { x, z }, rotation);
        // The pier, the quay at its root and the settlement all take the same origin.
        expect(layout.piers.some((p) => near(expected, p))).toBe(true);
        expect(layout.quays.some((q) => near(expected, q))).toBe(true);
        const smooth = pierOrigin(field, { x, z }, rotation);
        if (Math.hypot(smooth.x - expected.x, smooth.z - expected.z) > 1e-9) movedBySurface++;
      }
    }
    expect(ports).toBeGreaterThan(20);
    // The sample has teeth: on some ports the smooth field and the drawn surface put the origin in different places.
    expect(movedBySurface).toBeGreaterThan(0);
  });

  it("keeps every pier at water level with its decoration's rotation and scale", () => {
    const preset = getMapPreset("small");
    const wrap = createWrap(preset.columns);
    const cells = generateMap(preset, 1, wrap);
    const layout = decorationLayout(cells, wrap);
    const pierCells = cells.filter((c) => pierRotation(c) !== undefined);
    expect(layout.piers).toHaveLength(pierCells.length);
    for (const pier of layout.piers) {
      expect(pier.type).toBe("pier");
      expect(pier.worldY).toBe(0);
      expect(pierCells.some((c) => pierRotation(c) === pier.rotation)).toBe(true);
    }
  });
});
