/**
 * The village's placement over 200 seeds of every map size (#87): no
 * floating or buried buildings, none askew on the beach (#91), no building (the port kit's included)
 * across a terrace riser, nothing on a street's running surface, the quay
 * or the pier, no kit building on a street, a lane or their kerbs, and no
 * kerb or edge stone inside a building's walls.
 */
import { beforeEach, describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset, type MapSizeId } from "../../game/mapConfig";
import { createWrap, hexToWorld } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import { landSurface } from "./landMesh";
import { pierOrigin } from "./pierPlacement";
import { portBuildings, planFootprint, type PlanFootprint } from "./portSettlement";
import { portQuays } from "./quayPlacement";
import { crossesRiser, footprintOnStreet, KERB_WIDTH, RETAINING_WALL_DEPTH } from "./townPlateau";
import { pieceClearRadius, streetEdgeStones, townClutter } from "./townDetailLayout";
import { AGED_BUILDING_PLAN } from "./agedBuildingGeometry";
import { BUILDING_FOOTING } from "./buildingGeometry";
import { BUILDING_SCALE, PROP_SCALE } from "./worldScale";
import {
  overlaps,
  pierRect,
  planPortTowns,
  polylineDistance,
  quayRect,
  rectCorners,
  villageWalls,
  BEACH_MAX_SPREAD,
  BEACH_TOP,
  VILLAGE_DRY_HEIGHT,
  VILLAGE_MAX_BURY,
  VILLAGE_MAX_FOOTING_SHOWN,
  type PlanRect,
} from "./villageLayout";

const SEEDS = 200;
/**
 * Seeds per test. The sweep takes ~2 minutes on a runner; run as one block it
 * starves the worker's event loop past vitest's 60 s RPC timeout, so it runs in
 * short tests with a macrotask yield before each (see the `beforeEach` below).
 */
const SEEDS_PER_TEST = 20;
/** Slack for probes between the placement's own, world units (about 13 cm at 65 m per unit). */
const SLACK = 0.002;

/** The piers as `decorationLayout` places them: from where the drawn beach meets the water. */
function piersOf(cells: readonly MapCell[], drawn: ReturnType<typeof landSurface>) {
  const piers: { worldX: number; worldZ: number; rotation: number; scale: number }[] = [];
  for (const cell of cells) {
    const [x, , z] = hexToWorld(cell.hex);
    for (const deco of cell.decorations ?? []) {
      if (deco.type !== "pier") continue;
      const scale = (deco.scale ?? 1) * PROP_SCALE;
      const origin = pierOrigin(drawn, { x: x + deco.position[0], z: z + deco.position[2] }, deco.rotation);
      piers.push({ worldX: origin.x, worldZ: origin.z, rotation: deco.rotation, scale });
    }
  }
  return piers;
}

/** A kit building's plan footprint as a rectangle in the world. */
const planRectOf = (plan: PlanFootprint, x: number, z: number): PlanRect => ({ x, z, fx: Math.sin(plan.yaw), fz: Math.cos(plan.yaw), halfW: plan.halfW, halfD: plan.halfD });

interface Tally {
  maps: number;
  ports: number;
  houses: number;
  clutter: number;
  kit: number;
  stones: number;
  failures: string[];
}

function sweep(size: MapSizeId, firstSeed: number, lastSeed: number): Tally {
  const tally: Tally = { maps: 0, ports: 0, houses: 0, clutter: 0, kit: 0, stones: 0, failures: [] };
  const fail = (seed: number, what: string) => {
    if (tally.failures.length < 20) tally.failures.push(`${size} seed ${seed}: ${what}`);
  };
  const preset = getMapPreset(size);
  const wrap = createWrap(preset.columns);
  for (let seed = firstSeed; seed <= lastSeed; seed++) {
    const cells = generateMap(preset, seed, wrap);
    const terrainSeed = terrainSeedFromCells(cells);
    const field = createTerrainHeightField(cells, terrainSeed, { wrap });
    const drawn = landSurface(field);
    const piers = piersOf(cells, drawn);
    const kit = portBuildings(cells, drawn, terrainSeed, field.townPlateaus);
    const quays = portQuays(cells, drawn, terrainSeed);
    const { ports } = planPortTowns(cells, drawn, { buildings: kit, quays, piers, plateaus: field.townPlateaus }, terrainSeed);
    const clutter = townClutter(ports, drawn, BUILDING_SCALE, terrainSeed);
    tally.maps++;
    tally.ports += ports.length;
    tally.clutter += clutter.length;
    for (const port of ports) {
      const harbour: PlanRect[] = [pierRect(port.pier), ...port.quays.map(quayRect)];
      // Every building's walls: the kit's here, the village's below; no kerb or edge stone may stand in one.
      const walls: PlanRect[] = port.buildings.map(villageWalls);
      // The kit's walls keep off the risers too, and off the streets, the lanes and their kerbs.
      for (const b of kit) {
        if (Math.hypot(b.worldX - port.cx, b.worldZ - port.cz) > 1) continue;
        const plan = AGED_BUILDING_PLAN[b.kind];
        walls.push({ x: b.worldX, z: b.worldZ, fx: Math.sin(b.yaw), fz: Math.cos(b.yaw), halfW: plan.halfW * b.scale, halfD: plan.halfD * b.scale });
        if (Math.hypot(b.worldX - port.cx, b.worldZ - port.cz) < 1e-9) continue; // a tower's last-resort fallback
        const corners = rectCorners(planRectOf(planFootprint(b.kind, b.scale, b.yaw), b.worldX, b.worldZ));
        if (crossesRiser(port.plateau, corners, RETAINING_WALL_DEPTH * BUILDING_SCALE)) fail(seed, `kit ${b.kind} across a riser`);
        if (footprintOnStreet(port.plateau, corners, KERB_WIDTH * BUILDING_SCALE)) fail(seed, `kit ${b.kind} on a street or its kerbs`);
        tally.kit++;
      }
      for (const stone of streetEdgeStones(port.plateau, drawn, BUILDING_SCALE, port.walls)) {
        tally.stones++;
        if (walls.some((w) => overlaps(w, stone, 0))) fail(seed, `a ${stone.kerb ? "kerb" : "edge stone"} inside a building's walls`);
      }
      for (const b of port.buildings) {
        tally.houses++;
        const walls = villageWalls(b);
        const corners = rectCorners(walls);
        if (crossesRiser(port.plateau, corners, RETAINING_WALL_DEPTH * BUILDING_SCALE)) fail(seed, `${b.variant} across a riser`);
        for (const s of port.streets) {
          if (corners.some(([x, z]) => polylineDistance(x, z, s.line) < s.halfWidth) || polylineDistance(b.worldX, b.worldZ, s.line) < s.halfWidth) fail(seed, `${b.variant} on a street`);
        }
        if (harbour.some((h) => overlaps(h, walls, 0))) fail(seed, `${b.variant} on the quay or pier`);
        // On the ground: probed far denser than the placement does.
        let top = -Infinity;
        let bottom = Infinity;
        for (let u = -1; u <= 1.0001; u += 0.2) {
          for (let v = -1; v <= 1.0001; v += 0.2) {
            const h = drawn.sampleHeight(walls.x + walls.fz * u * walls.halfW + walls.fx * v * walls.halfD, walls.z - walls.fx * u * walls.halfW + walls.fz * v * walls.halfD);
            top = Math.max(top, h);
            bottom = Math.min(bottom, h);
          }
        }
        if (bottom <= VILLAGE_DRY_HEIGHT - SLACK) fail(seed, `${b.variant} on wet ground`);
        if (top - b.worldY > VILLAGE_MAX_BURY * b.scale + SLACK) fail(seed, `${b.variant} buried by ${(top - b.worldY).toFixed(4)}`);
        if (b.worldY - bottom > VILLAGE_MAX_FOOTING_SHOWN * b.scale + SLACK) fail(seed, `${b.variant} floating: ${(b.worldY - bottom).toFixed(4)} of footing`);
        // On the beach, near-level ground only (#91).
        if (bottom < BEACH_TOP - SLACK && top - bottom > BEACH_MAX_SPREAD * b.scale + SLACK) fail(seed, `${b.variant} askew on the beach: ground spans ${(top - bottom).toFixed(4)}`);
        // The footing reaches under the lowest ground.
        if (b.worldY - BUILDING_FOOTING * b.scale > bottom) fail(seed, `${b.variant} footing short of the ground`);
      }
      for (const c of clutter) {
        if (Math.hypot(c.x - port.cx, c.z - port.cz) > 1) continue;
        const r = pieceClearRadius(c);
        for (const s of port.streets) if (polylineDistance(c.x, c.z, s.line) < s.halfWidth) fail(seed, `${c.kind} on a street`);
        if (harbour.some((h) => overlaps(h, { x: c.x, z: c.z, fx: 0, fz: 1, halfW: r * 0.7, halfD: r * 0.7 }, 0))) fail(seed, `${c.kind} on the quay or pier`);
        const g = drawn.sampleHeight(c.x, c.z);
        if (c.y > g + SLACK) fail(seed, `${c.kind} floating`);
        if (g - c.y > Math.max(0.01, r)) fail(seed, `${c.kind} buried by ${(g - c.y).toFixed(4)}`);
      }
    }
  }
  return tally;
}

describe("village placement over 200 seeds per map size (#87)", () => {
  // Tests in a file chain on microtasks, so without this the worker never reaches
  // its message queue between them and vitest's onTaskUpdate RPC times out.
  beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  for (const size of ["small", "medium", "large"] as const) {
    for (let first = 1; first <= SEEDS; first += SEEDS_PER_TEST) {
      const last = Math.min(SEEDS, first + SEEDS_PER_TEST - 1);
      it(`holds on every ${size} map, seeds ${first} to ${last}`, () => {
        const started = performance.now();
        const tally = sweep(size, first, last);
        console.log(
          `village ${size} seeds ${first}-${last}: ${tally.maps} maps, ${tally.ports} ports, ${(tally.houses / tally.ports).toFixed(1)} houses and ` +
            `${(tally.clutter / tally.ports).toFixed(1)} clutter pieces, ${(tally.kit / tally.ports).toFixed(2)} kit buildings and ` +
            `${(tally.stones / tally.ports).toFixed(0)} kerb and edge stones per port, in ${((performance.now() - started) / 1000).toFixed(1)} s`
        );
        expect(tally.failures).toEqual([]);
        expect(tally.houses / tally.ports).toBeGreaterThan(20);
        // The watchtower and church, and most of the tavern, warehouse and house, at every port; the kerbs drawn.
        expect(tally.kit / tally.ports).toBeGreaterThan(2.5);
        expect(tally.stones / tally.ports).toBeGreaterThan(50);
      }, 120000);
    }
  }
});
