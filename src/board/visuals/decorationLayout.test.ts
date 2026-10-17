import { describe, it, expect, beforeAll } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset, type MapSizeId } from "../../game/mapConfig";
import { createWrap, hexToWorld, worldToHex, type MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { decorationLayout } from "./decorationLayout";
import { sharedTerrainField } from "./sharedTerrainField";
import { landSurface } from "./landMesh";
import { pierOrigin } from "./pierPlacement";
import { cellId } from "./islands";
import { islandLooks, lookOfCell, treeFactor } from "./islandLook";
import { PROP_DENSITY } from "./worldScale";

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
  // The sample maps, their layouts and their terrain fields, built once outside
  // any test's time limit: generating eight real maps is the expensive part.
  // About 2 s on an idle machine, so the hook gets its own limit (below) rather
  // than the default 10 s, which a busy machine can run past (#335).
  let sampled: {
    cells: MapCell[];
    seed: number;
    wrap: MapWrap;
    layout: ReturnType<typeof decorationLayout>;
    field: ReturnType<typeof sharedTerrainField>;
  }[];
  beforeAll(() => {
    sampled = SAMPLES.map(([size, seed]) => {
      const preset = getMapPreset(size);
      const wrap = createWrap(preset.columns);
      const cells = generateMap(preset, seed, wrap);
      return { cells, seed, wrap, layout: decorationLayout(cells, wrap, seed), field: sharedTerrainField(cells, wrap, seed) };
    });
  }, 60_000);

  it("starts every drawn pier where its quay and the settlement's pier-root reserve expect it: on the drawn land surface (#59)", () => {
    let ports = 0;
    let movedBySurface = 0;
    for (const { cells, layout, field } of sampled) {
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
    // The first sample, small seed 1: no map of its own to generate.
    const { cells, layout } = sampled[0];
    const pierCells = cells.filter((c) => pierRotation(c) !== undefined);
    // The ports' own piers first, then the further ones their harbours gained (#181).
    const further = layout.village.furniture.flatMap((f) => f.piers);
    expect(layout.piers).toHaveLength(pierCells.length + further.length);
    layout.piers.forEach((pier, i) => {
      expect(pier.type).toBe("pier");
      expect(pier.worldY).toBe(0);
      if (i < pierCells.length) expect(pierCells.some((c) => pierRotation(c) === pier.rotation)).toBe(true);
      else expect(pier.rotation).toBe(further[i - pierCells.length].rotation);
    });
  });

  it("grows each island's palms by its look (#177): no more than its companions allow, and nearly all of them on a jungle", () => {
    for (const { cells, seed, wrap, layout } of sampled) {
      const looks = islandLooks(cells, wrap, seed);
      const treesOn = new Map<string, number>();
      for (const t of layout.trees) {
        const id = cellId(worldToHex(t.worldX, t.worldZ), wrap);
        treesOn.set(id, (treesOn.get(id) ?? 0) + 1);
      }
      for (const look of looks.islands) {
        let most = 0;
        let drawn = 0;
        let port = false;
        for (const cell of cells) {
          if (lookOfCell(looks, cell) !== look) continue;
          port ||= cell.hasPort;
          const decorations = (cell.decorations ?? []).filter((d) => d.type === "tree").length;
          most += decorations * (1 + (cell.hasPort ? 0 : Math.round((PROP_DENSITY - 1) * treeFactor(look))));
          drawn += treesOn.get(cellId(cell.hex, wrap)) ?? 0;
        }
        expect(drawn, look.id).toBeLessThanOrEqual(most);
        // A town clears the trees round it, so the floor holds on islands without a port.
        if (look.archetype === "jungle" && !port) expect(drawn, look.id).toBeGreaterThanOrEqual(most * 0.6);
      }
    }
  });
});
