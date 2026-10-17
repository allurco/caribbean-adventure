import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createWrap } from "../../game/hex";
import { decorationLayoutOf } from "./decorationLayout";
import { landSurface } from "./landMesh";
import { sharedTerrainField } from "./sharedTerrainField";
import { VILLAGE_DRAWS, villageGeometry, villageGeometryOf } from "./villageGeometry";
import { buildCrane, buildCraneLoad, buildMarketHall, buildQuayFlag } from "./harbourPieces";
import { harbourPieceColors } from "./villageColors";

describe("the village as one mesh (#87)", () => {
  const preset = getMapPreset("small");
  const wrap = createWrap(preset.columns);
  const cells = generateMap(preset, 1, wrap);
  const layout = decorationLayoutOf(cells, wrap, 1);
  const ground = landSurface(sharedTerrainField(cells, wrap, 1));
  const meshes = villageGeometry(layout, ground, 1);
  const mesh = meshes.village;

  it("bakes every house, piece of clutter, wall and kerb into one triangle soup with a normal and colour per vertex", () => {
    expect(mesh.vertexCount % 3).toBe(0);
    expect(mesh.positions.length).toBe(mesh.vertexCount * 3);
    expect(mesh.normals.length).toBe(mesh.vertexCount * 3);
    expect(mesh.colors.length).toBe(mesh.vertexCount * 3);
    // Tens of thousands of triangles for five ports' villages, in one draw.
    expect(mesh.vertexCount / 3).toBeGreaterThan(layout.village.buildings.length * 300);
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of mesh.colors) {
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    console.log(`village mesh, small seed 1: ${layout.village.buildings.length} buildings, ${layout.village.clutter.length} pieces, ${(mesh.vertexCount / 3).toFixed(0)} triangles`);
  });

  it("stays in the towns: every vertex within a town's reach, at its ground", () => {
    const { ports } = layout.village;
    for (let v = 0; v < mesh.vertexCount; v += 17) {
      const x = mesh.positions[v * 3];
      const z = mesh.positions[v * 3 + 2];
      expect(ports.some((p) => Math.hypot(x - p.plateau.x, z - p.plateau.z) <= p.plateau.reach + 0.1 || Math.hypot(x - p.cx, z - p.cz) < 1)).toBe(true);
    }
  });

  it("merges the three-storey town houses into the same soup, so the whole map's village stays one draw (#176)", () => {
    expect(layout.village.buildings.some((b) => b.variant === "townHouse")).toBe(true);
    // One geometry, one material (`PortVillage.tsx`): a draw per world copy, however many kinds the towns hold.
    expect(villageGeometryOf(cells, wrap, 1).village.vertexCount).toBe(mesh.vertexCount);
  });

  it("is built once per map", () => {
    expect(villageGeometryOf(cells, wrap, 1)).toBe(villageGeometryOf(cells, wrap, 1));
  });

  it("merges every crane, market hall and quay flag into the village's soup (#181)", () => {
    const { furniture } = layout.village;
    const bare = villageGeometry({ village: { ...layout.village, furniture: furniture.map((f) => ({ ...f, cranes: [], hall: undefined, flags: [] })) } }, ground, 1).village;
    const colors = harbourPieceColors();
    const cranes = furniture.reduce((n, f) => n + f.cranes.length, 0);
    const halls = furniture.filter((f) => f.hall).length;
    const flags = furniture.flatMap((f) => f.flags.filter((g) => g.mount === "quay"));
    expect(cranes).toBeGreaterThan(0);
    expect(halls).toBeGreaterThan(0);
    expect(flags.length).toBe(furniture.length);
    const expected = cranes * buildCrane(colors).vertexCount + halls * buildMarketHall(colors).vertexCount + flags.reduce((n, g) => n + buildQuayFlag(g.nation, colors).vertexCount, 0);
    expect(mesh.vertexCount - bare.vertexCount).toBe(expected);
  });

  it("hangs every crane's load in one swaying mesh of its own (#181)", () => {
    const cranes = layout.village.furniture.reduce((n, f) => n + f.cranes.length, 0);
    expect(meshes.loads.vertexCount).toBe(cranes * buildCraneLoad(harbourPieceColors()).vertexCount);
  });

  it("keeps the village layer to at most 4 draws, whatever the map: the soup and the cranes' loads (#158, #181)", () => {
    expect(VILLAGE_DRAWS).toBeLessThanOrEqual(4);
    for (const seed of [1, 2]) {
      const c = generateMap(preset, seed, wrap);
      expect(Object.keys(villageGeometryOf(c, wrap, seed))).toHaveLength(VILLAGE_DRAWS);
    }
  });
});
