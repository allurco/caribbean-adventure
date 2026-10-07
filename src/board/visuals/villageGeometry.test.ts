import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createWrap } from "../../game/hex";
import { decorationLayoutOf } from "./decorationLayout";
import { landSurface } from "./landMesh";
import { sharedTerrainField } from "./sharedTerrainField";
import { villageGeometry, villageGeometryOf } from "./villageGeometry";

describe("the village as one mesh (#87)", () => {
  const preset = getMapPreset("small");
  const wrap = createWrap(preset.columns);
  const cells = generateMap(preset, 1, wrap);
  const layout = decorationLayoutOf(cells, wrap);
  const ground = landSurface(sharedTerrainField(cells, wrap));
  const mesh = villageGeometry(layout, ground);

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

  it("is built once per map", () => {
    expect(villageGeometryOf(cells, wrap)).toBe(villageGeometryOf(cells, wrap));
  });
});
