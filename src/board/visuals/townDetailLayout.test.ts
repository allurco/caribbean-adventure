import { describe, it, expect, vi } from "vitest";

// The village is laid out at the #84 building scale (a 350 m hex), which
// propScale.ts reads from the URL; the tests pin it.
vi.mock("./propScale", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./propScale")>();
  const prop = 115 / 350;
  return { ...actual, PROP_SCALE: prop, BUILDING_SCALE: prop * 1.125, SHIP_SCALE: prop * 2, PROP_DENSITY: actual.propDensityFor(prop) };
});

import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createWrap } from "../../game/hex";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import { setSharedTerrainFieldOptions } from "./sharedTerrainField";
import { decorationLayout } from "./decorationLayout";
import { landSurface } from "./landMesh";
import { crossesRiser, planPortTowns, polylineDistance } from "./houseBoxLayout";
import { townClutter, townWorks } from "./townDetailLayout";
import { quayTopAt } from "./quayPlacement";
import { VILLAGE_PLAN } from "./villageBuildingGeometry";
import { BUILDING_SCALE, PROP_SCALE } from "./propScale";

const COLORS = { wallStone: [0.5, 0.45, 0.4], joint: [0.1, 0.1, 0.1], coping: [0.6, 0.55, 0.5], kerb: [0.4, 0.4, 0.35] } as const;

function town(seed: number) {
  setSharedTerrainFieldOptions({ townPlateaus: { scale: PROP_SCALE, buildingScale: BUILDING_SCALE } });
  const preset = getMapPreset("small");
  const wrap = createWrap(preset.columns);
  const cells = generateMap(preset, seed, wrap);
  const field = createTerrainHeightField(cells, terrainSeedFromCells(cells), { wrap, townPlateaus: { scale: PROP_SCALE, buildingScale: BUILDING_SCALE } });
  const layout = decorationLayout(cells, wrap);
  const ground = landSurface(field);
  const plan = planPortTowns(cells, ground, { buildings: layout.buildings, quays: layout.quays, piers: layout.piers, plateaus: field.townPlateaus }, terrainSeedFromCells(cells));
  return { field, ground, plan };
}

describe("the town's detail (#84)", () => {
  const { ground, plan } = town(1);

  it("builds villages of at least four kinds of house on every port", () => {
    expect(plan.ports.length).toBeGreaterThan(0);
    const kinds = new Set(plan.buildings.filter((b) => b.kind === "house").map((b) => b.variant));    expect([...kinds].sort()).toEqual(["cottage", "leanTo", "merchant", "stoneHouse"]);
    for (const port of plan.ports) expect(port.buildings.length).toBeGreaterThan(10);
  });

  it("keeps every building's walls off the streets and off the risers", () => {
    for (const port of plan.ports) {
      for (const b of port.buildings) {
        const wall = VILLAGE_PLAN[b.variant];
        const fx = Math.sin(b.yaw);
        const fz = Math.cos(b.yaw);
        const corners: [number, number][] = [];
        for (const [u, v] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          corners.push([b.worldX + fz * u * wall.halfW * b.scale + fx * v * wall.halfD * b.scale, b.worldZ - fx * u * wall.halfW * b.scale + fz * v * wall.halfD * b.scale]);
        }
        for (const [x, z] of corners) for (const s of port.streets) expect(polylineDistance(x, z, s.line)).toBeGreaterThan(s.halfWidth * 0.5);
        if (port.plateau) expect(crossesRiser(port.plateau, corners)).toBe(false);
      }
    }
  });

  it("raises retaining walls and kerbs on the plateaus", () => {
    const works = townWorks(plan.ports, ground, BUILDING_SCALE, COLORS);
    expect(works.vertexCount / 3).toBeGreaterThan(1000);
    // Every vertex lies within reach of some plateau.
    for (let i = 0; i < works.vertexCount; i += 11) {
      const x = works.positions[i * 3];
      const z = works.positions[i * 3 + 2];
      expect(plan.ports.some((p) => p.plateau && Math.hypot(x - p.plateau.x, z - p.plateau.z) <= p.plateau.reach + 0.05)).toBe(true);
    }
  });

  it("places clutter of every kind off the streets' running surface, the quay and the pier", () => {
    const clutter = townClutter(plan.ports, ground, BUILDING_SCALE, 1);
    const kinds = new Set(clutter.map((c) => c.kind));
    for (const kind of ["barrel", "crate", "stall", "boat", "garden", "palm", "fountain"]) expect(kinds.has(kind as never)).toBe(true);
    for (const c of clutter) {
      const port = plan.ports.reduce((a, b) => (Math.hypot(b.cx - c.x, b.cz - c.z) < Math.hypot(a.cx - c.x, a.cz - c.z) ? b : a));
      for (const s of port.streets) expect(polylineDistance(c.x, c.z, s.line)).toBeGreaterThanOrEqual(s.halfWidth);
      for (const q of port.quays) expect(quayTopAt(q, { x: c.x, z: c.z })).toBeUndefined();
      const rx = c.x - port.pier.worldX;
      const rz = c.z - port.pier.worldZ;
      const along = rx * Math.sin(port.pier.rotation) + rz * Math.cos(port.pier.rotation);
      const across = Math.abs(-rx * Math.cos(port.pier.rotation) + rz * Math.sin(port.pier.rotation));
      expect(along > -0.06 && along < 0.8 && across < 0.05).toBe(false);
    }
  });
});
