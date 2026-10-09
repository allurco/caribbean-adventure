import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createWrap, hexToWorld } from "../../game/hex";
import { sharedTerrainField } from "./sharedTerrainField";
import { decorationLayout } from "./decorationLayout";
import { landSurface } from "./landMesh";
import { crossesRiser, plateauPlanDistance, RETAINING_WALL_DEPTH } from "./townPlateau";
import { pieceClearRadius, TOWN_CLEAR_MARGIN, townWorks } from "./townDetailLayout";
import { AGED_BUILDING_PLAN } from "./agedBuildingGeometry";
import { VILLAGE_EAVE } from "./villageBuildingGeometry";
import { BUILDING_SCALE } from "./worldScale";
import {
  overlaps,
  pierRect,
  polylineDistance,
  quayRect,
  rectCorners,
  villageStance,
  villageWalls,
  VILLAGE_MAX_BURY,
  VILLAGE_MAX_FOOTING_SHOWN,
  type PlanRect,
  type VillageBuilding,
} from "./villageLayout";

const COLORS = { wallStone: [0.5, 0.45, 0.4], joint: [0.1, 0.1, 0.1], coping: [0.6, 0.55, 0.5], kerb: [0.4, 0.4, 0.35] } as const;

function town(seed: number) {
  const preset = getMapPreset("small");
  const wrap = createWrap(preset.columns);
  const cells = generateMap(preset, seed, wrap);
  const field = sharedTerrainField(cells, wrap);
  const layout = decorationLayout(cells, wrap);
  return { cells, field, ground: landSurface(field), layout };
}

const eaves = (b: VillageBuilding): PlanRect => {
  const walls = villageWalls(b);
  const eave = VILLAGE_EAVE[b.variant] * b.scale;
  return { ...walls, halfW: walls.halfW + eave, halfD: walls.halfD + eave };
};

describe("the port village (#87)", () => {
  const { cells, field, ground, layout } = town(1);
  const { village } = layout;

  it("builds a village of every house kind round every port with a pier", () => {
    const ports = cells.filter((c) => c.hasPort && c.decorations?.some((d) => d.type === "pier"));
    expect(village.ports).toHaveLength(ports.length);
    const kinds = new Set(village.buildings.map((b) => b.variant));
    expect([...kinds].sort()).toEqual(["cottage", "leanTo", "merchant", "stoneHouse", "warehouse"]);
    // About thirty houses round each square (ADR 0003).
    for (const port of village.ports) expect(port.buildings.length).toBeGreaterThan(15);
    const mean = village.buildings.length / village.ports.length;
    expect(mean).toBeGreaterThan(22);
    expect(mean).toBeLessThan(55);
  });

  it("keeps every building's walls off the streets and the risers, and its eaves off the kit, the quay, the pier and each other", () => {
    for (const port of village.ports) {
      const kit = layout.buildings.filter((b) => Math.hypot(b.worldX - port.cx, b.worldZ - port.cz) < 1);
      const harbour = [pierRect(port.pier), ...port.quays.map(quayRect)];
      for (const b of port.buildings) {
        const walls = villageWalls(b);
        for (const [x, z] of rectCorners(walls)) for (const s of port.streets) expect(polylineDistance(x, z, s.line)).toBeGreaterThanOrEqual(s.halfWidth);
        expect(crossesRiser(port.plateau, rectCorners(walls), RETAINING_WALL_DEPTH * BUILDING_SCALE)).toBe(false);
        for (const h of harbour) expect(overlaps(h, eaves(b), 0)).toBe(false);
        for (const k of kit) {
          const plan = AGED_BUILDING_PLAN[k.kind];
          const kitRect = { x: k.worldX, z: k.worldZ, fx: Math.sin(k.yaw), fz: Math.cos(k.yaw), halfW: plan.halfW * k.scale, halfD: plan.halfD * k.scale };
          expect(overlaps(kitRect, eaves(b), 0)).toBe(false);
        }
        for (const other of port.buildings) {
          // A lean-to stands against its house.
          if (other === b || other.variant === "leanTo" || b.variant === "leanTo") continue;
          expect(overlaps(eaves(other), eaves(b), 0)).toBe(false);
        }
      }
    }
  });

  it("stands every building on the drawn ground: its uphill side buried no deeper, and no more footing shown, than the rule allows", () => {
    expect(villageStance(0.1, 0.1, 1)).toBe(0.1);
    expect(villageStance(0.1, 0.1 + VILLAGE_MAX_BURY * 2, 1)).toBeUndefined();
    for (const b of village.buildings) {
      const walls = villageWalls(b);
      const heights: number[] = [];
      for (let u = -1; u <= 1; u += 0.25) {
        for (let v = -1; v <= 1; v += 0.25) {
          heights.push(ground.sampleHeight(walls.x + walls.fz * u * walls.halfW + walls.fx * v * walls.halfD, walls.z - walls.fx * u * walls.halfW + walls.fz * v * walls.halfD));
        }
      }
      const top = Math.max(...heights);
      const bottom = Math.min(...heights);
      // Slack for the probes between the placement's own (a 3 × 3 grid and the lattice's creases).
      expect(top - b.worldY).toBeLessThanOrEqual(VILLAGE_MAX_BURY * b.scale + 0.002);
      expect(b.worldY - bottom).toBeLessThanOrEqual(VILLAGE_MAX_FOOTING_SHOWN * b.scale + 0.002);
      expect(b.worldY).toBeGreaterThan(0);
    }
  });

  it("raises retaining walls and kerbs on the plateaus", () => {
    const works = townWorks(village.ports, ground, BUILDING_SCALE, COLORS);
    expect(works.vertexCount / 3).toBeGreaterThan(1000);
    for (let i = 0; i < works.vertexCount; i += 11) {
      const x = works.positions[i * 3];
      const z = works.positions[i * 3 + 2];
      expect(village.ports.some((p) => Math.hypot(x - p.plateau.x, z - p.plateau.z) <= p.plateau.reach + 0.05)).toBe(true);
    }
  });

  it("places clutter of every kind off the streets' running surface, the quay and the pier", () => {
    const kinds = new Set(village.clutter.map((c) => c.kind));
    for (const kind of ["barrel", "crate", "stall", "boat", "garden", "palm", "fountain"]) expect(kinds.has(kind as never)).toBe(true);
    for (const c of village.clutter) {
      const port = village.ports.reduce((a, b) => (Math.hypot(b.cx - c.x, b.cz - c.z) < Math.hypot(a.cx - c.x, a.cz - c.z) ? b : a));
      for (const s of port.streets) expect(polylineDistance(c.x, c.z, s.line)).toBeGreaterThanOrEqual(s.halfWidth);
      for (const h of [pierRect(port.pier), ...port.quays.map(quayRect)]) {
        const r = pieceClearRadius(c);
        expect(overlaps(h, { x: c.x, z: c.z, fx: 0, fz: 1, halfW: r * 0.7, halfD: r * 0.7 }, 0)).toBe(false);
      }
    }
  });

  it("keeps trees, rocks, stones and shrubs out of the town's plan and off its houses", () => {
    const near = (x: number, z: number) => village.ports.filter((p) => Math.hypot(x - p.plateau.x, z - p.plateau.z) < p.plateau.reach + 0.5);
    let checked = 0;
    for (const prop of [...layout.trees, ...layout.rocks, ...layout.stones, ...layout.shrubs]) {
      for (const port of near(prop.worldX, prop.worldZ)) {
        checked++;
        expect(plateauPlanDistance(port.plateau, prop.worldX, prop.worldZ)).toBeGreaterThanOrEqual(TOWN_CLEAR_MARGIN);
        for (const b of port.buildings) {
          const r = villageWalls(b);
          expect(overlaps(r, { x: prop.worldX, z: prop.worldZ, fx: 0, fz: 1, halfW: 0, halfD: 0 }, 0)).toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    // Without the town, the same map has trees where the town stands.
    const [px, , pz] = hexToWorld(cells.find((c) => c.hasPort)!.hex);
    expect(field.townPlateaus.some((p) => Math.hypot(p.x - px, p.z - pz) < 1)).toBe(true);
  });
});
