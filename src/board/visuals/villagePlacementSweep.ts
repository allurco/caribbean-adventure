/**
 * The village's placement over 200 seeds of every map size (#87): no
 * floating or buried buildings, none askew on the beach (#91), no building (the port kit's included)
 * across a terrace riser, nothing on a street's running surface, the quay
 * or the pier, no kit building on a street, a lane or their kerbs, and no
 * kerb or edge stone inside a building's walls. At ×2.5 (#176): 20 to 30
 * buildings a port (the village's standing houses and the kit), never more
 * than 30, houses about 0.08 of a hex across, and every pier reaching out
 * over the water.
 *
 * The sweep is shared by the `villagePlacement.<size>.<seeds>.test.ts` files:
 * each runs one block of seeds, so the files run on separate workers rather
 * than as one ~2.5 minute file holding up the whole suite.
 */
import { beforeEach, describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset, type MapSizeId } from "../../game/mapConfig";
import { createWrap, hexToWorld } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { createTerrainHeightField } from "./terrainHeightField";
import { landSurface } from "./landMesh";
import { PIER_END_DEPTH, PIER_MAX_REACH, pierOrigin, pierStretch } from "./pierPlacement";
import { portBuildings, planFootprint, type PlanFootprint } from "./portSettlement";
import { portQuays } from "./quayPlacement";
import { crossesRiser, footprintOnStreet, KERB_WIDTH, RETAINING_WALL_DEPTH } from "./townPlateau";
import { pieceClearRadius, streetEdgeStones, townClutter } from "./townDetailLayout";
import { AGED_BUILDING_PLAN } from "./agedBuildingGeometry";
import { BUILDING_FOOTING } from "./buildingGeometry";
import { BUILDING_SCALE, TOWN_PIECE_SCALE } from "./worldScale";
import { PIER_LENGTH } from "./pierGeometry";
import { SEA_LEVEL } from "./terrainHeightField";
import { VILLAGE_PLAN } from "./villageBuildingGeometry";
import { VILLAGE_EAVE } from "./villageBuildingGeometry";
import { townCellsRule } from "./townBound";
import { townCellsBound } from "./townCells";
import {
  overlaps,
  pierRect,
  planPortTowns,
  polylineDistance,
  quayRect,
  rectCorners,
  villageWalls,
  wallGround,
  BEACH_MAX_SPREAD,
  BEACH_TOP,
  VILLAGE_DRY_HEIGHT,
  VILLAGE_HOUSES,
  standingBuildings,
  VILLAGE_MAX_BURY,
  VILLAGE_MAX_FOOTING_SHOWN,
  type PlanRect,
} from "./villageLayout";

/** Seeds per map size, over all the files: 1 to SEEDS. */
export const SEEDS = 200;
/**
 * Seeds per test. The sweep takes ~2 minutes on a runner; run as one block it
 * starves the worker's event loop past vitest's 60 s RPC timeout, so it runs in
 * short tests with a macrotask yield before each (see the `beforeEach` below).
 */
const SEEDS_PER_TEST = 20;
/** Slack for probes between the placement's own, world units (about 13 cm at 65 m per unit). */
const SLACK = 0.002;
/** Buildings a port stands at ×2.5, the village's and the kit's (#176): the band most ports fall in, and the most any does. */
const PORT_BUILDINGS: readonly [number, number] = [20, 30];
/** Share of ports in a run of seeds whose building count falls in the band: a port on a narrow islet has room for fewer. */
const IN_BAND_SHARE = 0.85;
/** A house's width over a hex's (vertex to vertex, 2 units), on average over a run of seeds (#158's target). */
const HOUSE_WIDTH_OF_HEX: readonly [number, number] = [0.07, 0.09];


/** The piers as `decorationLayout` places them: from where the drawn beach meets the water. */
function piersOf(cells: readonly MapCell[], drawn: ReturnType<typeof landSurface>) {
  const piers: { worldX: number; worldZ: number; rotation: number; scale: number; stretch: number }[] = [];
  for (const cell of cells) {
    const [x, , z] = hexToWorld(cell.hex);
    for (const deco of cell.decorations ?? []) {
      if (deco.type !== "pier") continue;
      const scale = (deco.scale ?? 1) * TOWN_PIECE_SCALE;
      const centre = { x: x + deco.position[0], z: z + deco.position[2] };
      const origin = pierOrigin(drawn, centre, deco.rotation);
      piers.push({ worldX: origin.x, worldZ: origin.z, rotation: deco.rotation, scale, stretch: pierStretch(drawn, centre, origin, deco.rotation, scale) });
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
  /** Per port: its village's standing buildings and its kit's. */
  perPort: number[];
  /** Every standing village house's width over the hex's. */
  widths: number[];
  clutter: number;
  kit: number;
  stones: number;
  failures: string[];
}

function sweep(size: MapSizeId, firstSeed: number, lastSeed: number): Tally {
  const tally: Tally = { maps: 0, ports: 0, houses: 0, perPort: [], widths: [], clutter: 0, kit: 0, stones: 0, failures: [] };
  const fail = (seed: number, what: string) => {
    if (tally.failures.length < 20) tally.failures.push(`${size} seed ${seed}: ${what}`);
  };
  const preset = getMapPreset(size);
  const wrap = createWrap(preset.columns);
  for (let seed = firstSeed; seed <= lastSeed; seed++) {
    const cells = generateMap(preset, seed, wrap);
    const terrainSeed = seed;
    const field = createTerrainHeightField(cells, terrainSeed, { wrap });
    const drawn = landSurface(field);
    const piers = piersOf(cells, drawn);
    const kit = portBuildings(cells, drawn, terrainSeed, field.townPlateaus);
    const quays = portQuays(cells, drawn, terrainSeed);
    const { ports } = planPortTowns(cells, drawn, { buildings: kit, quays, piers, plateaus: field.townPlateaus }, terrainSeed);
    const clutter = townClutter(ports, drawn, TOWN_PIECE_SCALE, terrainSeed);
    tally.maps++;
    tally.ports += ports.length;
    tally.clutter += clutter.length;
    const towns = ports.map((p) => townCellsBound(p.town));
    for (const c of clutter) if (!towns.some((t) => t.contains(c.x, c.z, 0))) fail(seed, `${c.kind} on no port's town cells`);
    for (const port of ports) {
      const harbour: PlanRect[] = [pierRect(port.pier), ...port.quays.map(quayRect)];
      // Every building's walls: the kit's here, the village's below; no kerb or edge stone may stand in one.
      const walls: PlanRect[] = port.buildings.map(villageWalls);
      // The pier runs out past the beach and ends over the water, short of a ship docked in the hex it faces.
      const deck = PIER_LENGTH * port.pier.scale * (port.pier.stretch ?? 1);
      const endX = port.pier.worldX + Math.sin(port.pier.rotation) * deck;
      const endZ = port.pier.worldZ + Math.cos(port.pier.rotation) * deck;
      const seaEnd = drawn.sampleHeight(endX, endZ);
      if (seaEnd > SEA_LEVEL - PIER_END_DEPTH) fail(seed, `pier ends on ground ${seaEnd.toFixed(4)} high`);
      if (Math.hypot(endX - port.cx, endZ - port.cz) > PIER_MAX_REACH + 1e-9) fail(seed, "pier reaches into the docking hex");
      const kitHere = kit.filter((b) => Math.hypot(b.worldX - port.cx, b.worldZ - port.cz) <= 1).length;
      const standing = standingBuildings(port.buildings);
      if (standing > VILLAGE_HOUSES) fail(seed, `${standing} village buildings, over the target`);
      tally.perPort.push(standing + kitHere);
      for (const b of port.buildings) if (b.variant !== "leanTo" && b.variant !== "warehouse") tally.widths.push((2 * VILLAGE_PLAN[b.variant].halfW * b.scale) / 2);
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
      for (const stone of streetEdgeStones(port.plateau, drawn, BUILDING_SCALE, port.walls, { worldSeed: seed, portId: port.portId })) {
        tally.stones++;
        if (walls.some((w) => overlaps(w, stone, 0))) fail(seed, `a ${stone.kerb ? "kerb" : "edge stone"} inside a building's walls`);
      }
      const onTown = townCellsRule(port.town);
      for (const b of port.buildings) {
        tally.houses++;
        const walls = villageWalls(b);
        const corners = rectCorners(walls);
        // On the port's town cells, the eaves included, and off a spilled cell's shore band (#170).
        const eave = VILLAGE_EAVE[b.variant] * b.scale;
        const refused = onTown(b.worldX, b.worldZ, Math.hypot(walls.halfW + eave, walls.halfD + eave), wallGround(drawn, walls).bottom);
        if (refused) fail(seed, `${b.variant} ${refused}`);
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
      const inThisTown = townCellsBound(port.town);
      for (const c of clutter) {
        // This port's pieces: on its town cells (a piece elsewhere is another port's, or wrongly placed: the check below).
        if (!inThisTown.contains(c.x, c.z, 0)) continue;
        const r = pieceClearRadius(c);
        if (onTown(c.x, c.z, r * 0.99, drawn.sampleHeight(c.x, c.z) + 1) === "outside town") fail(seed, `${c.kind} outside the town`);
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

/** The village placement tests on `size` maps, seeds `firstSeed` to `lastSeed`, in blocks of SEEDS_PER_TEST. */
export function describeVillagePlacement(size: MapSizeId, firstSeed: number, lastSeed: number): void {
  describe(`village placement on ${size} maps, seeds ${firstSeed} to ${lastSeed} of ${SEEDS} (#87)`, () => {
    // Tests in a file chain on microtasks, so without this the worker never reaches
    // its message queue between them and vitest's onTaskUpdate RPC times out.
    beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    for (let first = firstSeed; first <= lastSeed; first += SEEDS_PER_TEST) {
      const last = Math.min(lastSeed, first + SEEDS_PER_TEST - 1);
      it(`holds on every ${size} map, seeds ${first} to ${last}`, () => {
        const started = performance.now();
        const tally = sweep(size, first, last);
        console.log(
          `village ${size} seeds ${first}-${last}: ${tally.maps} maps, ${tally.ports} ports, ${(tally.houses / tally.ports).toFixed(1)} houses and ` +
            `${(tally.clutter / tally.ports).toFixed(1)} clutter pieces, ${(tally.kit / tally.ports).toFixed(2)} kit buildings and ` +
            `${(tally.stones / tally.ports).toFixed(0)} kerb and edge stones per port, in ${((performance.now() - started) / 1000).toFixed(1)} s`
        );
        const inBand = tally.perPort.filter((n) => n >= PORT_BUILDINGS[0] && n <= PORT_BUILDINGS[1]).length;
        const mean = tally.perPort.reduce((a, b) => a + b, 0) / tally.perPort.length;
        const width = tally.widths.reduce((a, b) => a + b, 0) / tally.widths.length;
        console.log(
          `  ${size} ${first}-${last}: buildings a port mean ${mean.toFixed(1)}, ${((100 * inBand) / tally.perPort.length).toFixed(0)} % in ${PORT_BUILDINGS.join("–")}, ` +
            `least ${Math.min(...tally.perPort)}, most ${Math.max(...tally.perPort)}; house width ${width.toFixed(4)} of a hex`
        );
        expect(tally.failures).toEqual([]);
        expect(mean).toBeGreaterThanOrEqual(PORT_BUILDINGS[0]);
        expect(mean).toBeLessThanOrEqual(PORT_BUILDINGS[1]);
        expect(Math.max(...tally.perPort)).toBeLessThanOrEqual(PORT_BUILDINGS[1]);
        expect(inBand / tally.perPort.length).toBeGreaterThanOrEqual(IN_BAND_SHARE);
        expect(width).toBeGreaterThanOrEqual(HOUSE_WIDTH_OF_HEX[0]);
        expect(width).toBeLessThanOrEqual(HOUSE_WIDTH_OF_HEX[1]);
        // The watchtower and church, and most of the tavern, warehouse and house, at every port; the kerbs drawn.
        expect(tally.kit / tally.ports).toBeGreaterThan(2.5);
        expect(tally.stones / tally.ports).toBeGreaterThan(50);
      }, 120000);
    }
  });
}
