/**
 * The harbour's furniture (#181): more piers, dock cranes, a market hall
 * and the ports' flags, laid out round each port's village. Pure, no
 * Three.js; `harbourPieces.ts` models them, `villageGeometry.ts` merges
 * them into the village's draw.
 *
 * Laid out after the village's houses (`planPortTowns`), each on its own
 * sub-seed, so a pier's or a crane's stream never moves a house (#158 S4);
 * the town's clutter is laid out after it and keeps clear of it
 * (`furnishedPlans`).
 *
 * - **Piers** (`SEED_FEATURES.piers`): the port's own pier and one to three
 *   more, so 2–4, where the shore allows. A pier starts just inland of the
 *   drawn shore on the town's cells (the one thing on a spilled cell's
 *   shore band), runs down the beach's fall out over the water to stand
 *   `PIER_END_DEPTH` in it, and keeps every ship's hex clear: no point of
 *   its deck comes nearer a water hex's centre than half a Galleon
 *   (`PIER_SHIP_CLEARANCE`), as the port's own pier keeps its docking hex.
 *   It keeps off the quay, the other piers and every building.
 * - **Cranes** (`SEED_FEATURES.cranes`): one or two where a pier has dry,
 *   level ground beside its root, the jib swung out over the water towards
 *   the pier; none where no pier has.
 * - **The market hall** (`SEED_FEATURES.marketHall`): one open-sided
 *   thatched hall on the square's edge or along a street, facing it, on the
 *   village's rules (the town's cells, off the streets, the risers and the
 *   shore band, on dry, near-level ground, clear of every building).
 * - **Flags**: the port's nation over its watchtower (drawn with the tower,
 *   `PortBuildings.tsx`) and on a pole at the quay's corner. The port cell's
 *   nation decides; the black flag flies only over a pirate haven. Nothing
 *   is stored in `G`.
 *
 * Nothing but a pier stands on water.
 */
import { hexToWorld, neighbors, type MapWrap } from "../../game/hex";
import type { MapCell, PortNation } from "../../game/types";
import { SHIP_HULL_BOXES } from "../shipHull";
import { AGED_TOWER_FLAG_HOIST } from "./agedBuildingGeometry";
import type { Vec3 } from "./facetBuilder";
import type { GroundField } from "./groundPlacement";
import { CRANE_FOOT, CRANE_JIB_TIP, MARKET_HALL_EAVE, MARKET_HALL_PLAN, QUAY_FLAG_HOIST } from "./harbourPieces";
import { cellId, type PortId } from "./islands";
import { PIER_LENGTH, PIER_WIDTH } from "./pierGeometry";
import { PIER_END_DEPTH, PIER_LAND_OVERLAP, PIER_SHORE_HEIGHT } from "./pierPlacement";
import type { PortBuilding } from "./portSettlement";
import { SEED_FEATURES } from "./seedFeatures";
import { stream, subSeed } from "./subSeed";
import { SEA_LEVEL } from "./terrainHeightField";
import { townCellsBound } from "./townCells";
import { townCellsRule } from "./townBound";
import { crossesRiser, KERB_WIDTH, RETAINING_WALL_DEPTH } from "./townPlateau";
import { EAVE_GAP, overlaps, pierRect, polylineDistance, rectCorners, VILLAGE_DRY_HEIGHT, wallGround, type PierPlan, type PlanRect, type PortTownPlan } from "./villageLayout";
import { BUILDING_SCALE, TOWN_PIECE_SCALE } from "./worldScale";

/** Piers a port stands with its own (#158): the fewest where the shore allows, and the most. */
export const PORT_PIERS: readonly [number, number] = [2, 4];
/** Cranes a port stands where the shore allows. */
export const PORT_CRANES: readonly [number, number] = [1, 2];
/** Closest a pier's deck comes to a water hex's centre: half a Galleon, so no ship there meets it (as `PIER_MAX_REACH` keeps the docking hex). */
export const PIER_SHIP_CLEARANCE = SHIP_HULL_BOXES.Galleon[2] / 2;
/** A further pier's deck, as a share of the authored one: the shortest tried, the longest, and the step. */
export const PIER_STRETCH_RANGE: readonly [number, number] = [0.5, 1.2];
const PIER_STRETCH_STEP = 0.05;
/** The gap between two piers' decks, as a share of a deck's width. */
const PIER_GAP = 1.5;
/** Where along the town's shore piers are looked for: a ray every this many radians from each town cell's centre, between these distances. */
const SHORE_RAY_STEP = Math.PI / 24;
const SHORE_SEARCH: readonly [number, number] = [0.3, 0.98];
const SHORE_STEP = 0.02;
/** The beach's fall is measured over this distance. */
const SLOPE_PROBE = 0.02;
/** At scale 1: the gap a crane's foot keeps from a pier's side, how far out it may stand and how far inland, and the steps. */
const CRANE_BESIDE: readonly [number, number] = [0.012, 0.3];
const CRANE_INLAND: readonly [number, number] = [-0.05, 0.4];
const CRANE_STEP = 0.02;
/** How far the jib is swung from the pier's heading towards it (radians). */
const CRANE_SWING = 0.5;
/** At scale 1: how far a crane's foot sinks under its highest ground, and the most its footing may show below that. */
const CRANE_SINK = 0.004;
/** The least distance between two cranes' feet, world units. */
const CRANE_SPACING = 0.3;
/** At scale 1: how far the hall's floor sinks under the highest ground under it, the most it may show below that. */
const HALL_SINK = 0.006;
const HALL_FOOTING = 0.026;
/** Where the hall is looked for round the square: rings as shares of its radius, and the step round each. */
const HALL_RINGS: readonly number[] = [0.55, 0.8, 1.05, 1.3, 1.6, 1.95];
const HALL_RING_STEP = 0.3;
/** The grid the hall falls back on over each town cell: its reach either side of the cell's centre and its step, world units. */
const HALL_GRID_REACH = 0.8;
const HALL_GRID_STEP = 0.06;
/** Along a street, the step between the hall's tries, world units. */
const HALL_STREET_STEP = 0.05;
/** The quay's flagpole on its deck, at scale 1 in the quay's frame: its landward corner on the −x side, clear of the bollards, crate and pier mouth. */
export const QUAY_FLAG_SPOT: readonly [number, number] = [-0.175, -0.085];

/** A crane at its place: its foot's ground contact, the jib's heading (local +z), its scale. */
export interface CranePlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** The jib's tip, where its load hangs from and sways about (`craneSway.ts`). */
  tip: Vec3;
}

/** The market hall at its place: its floor's ground contact, facing (local +z), scale. */
export interface HallPlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

/** A flag the port flies: on its watchtower or its quay. */
export interface HarbourFlag {
  nation: PortNation;
  mount: "tower" | "quay";
  /** The hoist's top corner in the world (where the waving slice pins the cloth), the fly along the yaw's +x. */
  hoist: Vec3;
  /** The mount's turn and scale: the quay's pole stands at `foot`. */
  yaw: number;
  scale: number;
  /** The pole's foot on the quay's deck (the tower's flag flies from the tower's own pole). */
  foot?: Vec3;
}

/** One port's harbour furniture. */
export interface PortFurniture {
  portId: PortId;
  /** The piers the port gained (#181), besides its own: with it, `PORT_PIERS`. */
  piers: PierPlan[];
  cranes: CranePlacement[];
  hall?: HallPlacement;
  flags: HarbourFlag[];
  /** How many spots the shore offered for a further pier and for a crane: where it offered none, the port has none. */
  room: { piers: number; cranes: number };
}

/** A local point (x across, z along) of a frame at (x0, z0) turned by `yaw`, in the world (`villageMesh.ts`'s turn). */
const turn = (x0: number, z0: number, yaw: number, lx: number, lz: number): [number, number] => [x0 + lx * Math.cos(yaw) + lz * Math.sin(yaw), z0 - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

/** The deck's centre line of a pier: its land end and its sea end. */
export function pierLine(p: PierPlan): [[number, number], [number, number]] {
  const len = PIER_LENGTH * p.scale * (p.stretch ?? 1);
  return [
    [p.worldX, p.worldZ],
    [p.worldX + Math.sin(p.rotation) * len, p.worldZ + Math.cos(p.rotation) * len],
  ];
}

/** The world centres of the water hexes next to any of a town's cells: where ships lie. */
function shipHexes(cells: readonly MapCell[], wrap: MapWrap, town: PortTownPlan): [number, number][] {
  const byId = new Map(cells.map((c) => [cellId(c.hex, wrap), c]));
  const out: [number, number][] = [];
  const seen = new Set<string>();
  for (const h of town.town.cells) {
    for (const n of neighbors(h)) {
      const key = `${n.q},${n.r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cell = byId.get(cellId(n, wrap));
      if (cell && cell.terrain === "island") continue;
      const [x, , z] = hexToWorld(n);
      out.push([x, z]);
    }
  }
  return out;
}

/** The fall of the ground at (x, z): a unit direction down the slope, or undefined where it is flat. */
function downhill(ground: GroundField, x: number, z: number): [number, number] | undefined {
  const e = SLOPE_PROBE;
  const gx = ground.sampleHeight(x + e, z) - ground.sampleHeight(x - e, z);
  const gz = ground.sampleHeight(x, z + e) - ground.sampleHeight(x, z - e);
  const len = Math.hypot(gx, gz);
  return len < 1e-6 ? undefined : [-gx / len, -gz / len];
}

/** Every spot on a town's shore a further pier could take, in a fixed order: its land end, heading and stretch. */
function pierSpots(plan: PortTownPlan, ground: GroundField, ships: readonly [number, number][], scale: number): PierPlan[] {
  const bound = townCellsBound(plan.town);
  const half = (PIER_WIDTH / 2) * scale;
  const spots: PierPlan[] = [];
  for (const h of plan.town.cells) {
    const [cx, , cz] = hexToWorld(h);
    for (let a = 0; a < Math.PI * 2 - 1e-9; a += SHORE_RAY_STEP) {
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      // The first point down the ray where the land meets the water.
      let shore: number | undefined;
      for (let d = SHORE_SEARCH[0]; d <= SHORE_SEARCH[1] + 1e-9; d += SHORE_STEP) {
        if (ground.sampleHeight(cx + dx * d, cz + dz * d) <= PIER_SHORE_HEIGHT) {
          if (d > SHORE_SEARCH[0]) shore = d;
          break;
        }
      }
      if (shore === undefined) continue;
      const sx = cx + dx * shore;
      const sz = cz + dz * shore;
      // Down the beach's fall, so the pier runs square out from the shore.
      const fall = downhill(ground, sx, sz) ?? [dx, dz];
      const rotation = Math.atan2(fall[0], fall[1]);
      const ox = sx - fall[0] * PIER_LAND_OVERLAP;
      const oz = sz - fall[1] * PIER_LAND_OVERLAP;
      if (!bound.contains(ox, oz, half)) continue;
      const stretch = pierReach(ground, ox, oz, rotation, scale);
      if (stretch === undefined) continue;
      const pier: PierPlan = { worldX: ox, worldZ: oz, rotation, scale, stretch };
      const [from, to] = pierLine(pier);
      if (ships.some(([x, z]) => polylineDistance(x, z, [from, to]) < PIER_SHIP_CLEARANCE)) continue;
      spots.push(pier);
    }
  }
  return spots;
}

/**
 * The least stretch, in steps over `PIER_STRETCH_RANGE`, at which a pier
 * from (x, z) heading `rotation` ends over water `PIER_END_DEPTH` deep and
 * meets no land again on the way out; undefined where none does.
 */
function pierReach(ground: GroundField, x: number, z: number, rotation: number, scale: number): number | undefined {
  const dx = Math.sin(rotation);
  const dz = Math.cos(rotation);
  const deck = PIER_LENGTH * scale;
  for (let stretch = PIER_STRETCH_RANGE[0]; stretch <= PIER_STRETCH_RANGE[1] + 1e-9; stretch += PIER_STRETCH_STEP) {
    const len = deck * stretch;
    if (ground.sampleHeight(x + dx * len, z + dz * len) >= SEA_LEVEL - PIER_END_DEPTH) continue;
    // Once over the water, it stays over it out to its end.
    let wet = false;
    let ok = true;
    for (let t = 0; t <= len; t += SHORE_STEP) {
      const h = ground.sampleHeight(x + dx * t, z + dz * t);
      if (h < SEA_LEVEL) wet = true;
      else if (wet) {
        ok = false;
        break;
      }
    }
    return ok ? Math.round(stretch / PIER_STRETCH_STEP) * PIER_STRETCH_STEP : undefined;
  }
  return undefined;
}

/** The rectangle a crane's foot takes. */
export function craneFoot(c: Pick<CranePlacement, "x" | "z" | "yaw" | "scale">): PlanRect {
  return { x: c.x, z: c.z, fx: Math.sin(c.yaw), fz: Math.cos(c.yaw), halfW: CRANE_FOOT.half * c.scale, halfD: CRANE_FOOT.half * c.scale };
}

/** The rectangle the hall's thatch covers, and its posts' walls. */
export function hallFoot(h: Pick<HallPlacement, "x" | "z" | "yaw" | "scale">, eave = true): PlanRect {
  const e = eave ? MARKET_HALL_EAVE : 0;
  return { x: h.x, z: h.z, fx: Math.sin(h.yaw), fz: Math.cos(h.yaw), halfW: (MARKET_HALL_PLAN.halfW + e) * h.scale, halfD: (MARKET_HALL_PLAN.halfD + e) * h.scale };
}

/** The jib's tip of a crane at (x, y, z) heading `yaw`. */
const tipOf = (x: number, y: number, z: number, yaw: number, scale: number): Vec3 => {
  const [tx, tz] = turn(x, z, yaw, CRANE_JIB_TIP[0] * scale, CRANE_JIB_TIP[2] * scale);
  return [tx, y + CRANE_JIB_TIP[1] * scale, tz];
};

/** Every port's harbour furniture, laid round its village (`ports`, from `planPortTowns`); `worldSeed` is `G.mapSeed`. */
export function harbourFurniture(
  ports: readonly PortTownPlan[],
  cells: readonly MapCell[],
  wrap: MapWrap,
  ground: GroundField,
  kit: readonly PortBuilding[],
  worldSeed: number
): PortFurniture[] {
  return ports.map((plan) => {
    const portCell = cells.find((c) => c.hasPort && Math.abs(hexToWorld(c.hex)[0] - plan.cx) < 1e-9 && Math.abs(hexToWorld(c.hex)[2] - plan.cz) < 1e-9);
    const nation = portCell?.nation;
    const onTown = townCellsRule(plan.town);
    /** Everything taken so far: the village's plan, then each piece as it is placed. */
    const taken: PlanRect[] = [...plan.footprints];
    /** The buildings' walls and their eaves: what a crane's jib keeps clear of. */
    const buildings: PlanRect[] = plan.walls.map((w) => ({ ...w, halfW: w.halfW + EAVE_GAP * 4, halfD: w.halfD + EAVE_GAP * 4 }));
    const onStreet = (r: PlanRect) =>
      plan.streets.some((s) => rectCorners(r).some(([px, pz]) => polylineDistance(px, pz, s.line) < s.halfWidth) || polylineDistance(r.x, r.z, s.line) < s.halfWidth + Math.min(r.halfW, r.halfD));

    // 1. Piers: the target first, then one jitter per spot, so a spot's change reshuffles no other draw.
    const pierNext = stream(subSeed(worldSeed, SEED_FEATURES.piers, plan.portId));
    const target = PORT_PIERS[0] - 1 + Math.floor(pierNext() * (PORT_PIERS[1] - PORT_PIERS[0] + 1));
    const spots = pierSpots(plan, ground, shipHexes(cells, wrap, plan), plan.pier.scale).filter((p) => !taken.some((t) => overlaps(t, pierRect(p), 0)));
    const [root] = pierLine(plan.pier);
    const ranked = spots
      .map((p) => ({ p, score: Math.hypot(p.worldX - root[0], p.worldZ - root[1]) + pierNext() * 0.5 }))
      .sort((a, b) => a.score - b.score);
    const piers: PierPlan[] = [];
    const gap = PIER_WIDTH * plan.pier.scale * PIER_GAP;
    for (const { p } of ranked) {
      if (piers.length >= target) break;
      if (piers.some((q) => overlaps(pierRect(q), pierRect(p), gap)) || overlaps(pierRect(plan.pier), pierRect(p), gap)) continue;
      piers.push(p);
    }
    for (const p of piers) taken.push(pierRect(p));

    // 2. The market hall, on the square's edge or along a street, facing it.
    const hallNext = stream(subSeed(worldSeed, SEED_FEATURES.marketHall, plan.portId));
    const hallScale = BUILDING_SCALE;
    const start = hallNext() * Math.PI * 2;
    const p = plan.plateau;
    const tries: [number, number, number][] = [];
    for (const share of HALL_RINGS) {
      const r = p.squareRadius * share + MARKET_HALL_PLAN.halfD * hallScale;
      for (let a = 0; a < Math.PI * 2 - 1e-9; a += HALL_RING_STEP) {
        const dir = start + a;
        tries.push([p.x + Math.sin(dir) * r, p.z + Math.cos(dir) * r, dir + Math.PI]);
      }
    }
    for (const s of p.streets) {
      const len = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]) || 1;
      const tx = (s.to[0] - s.from[0]) / len;
      const tz = (s.to[1] - s.from[1]) / len;
      for (const side of [1, -1]) {
        const nx = tz * side;
        const nz = -tx * side;
        const off = s.halfWidth + KERB_WIDTH * BUILDING_SCALE + (MARKET_HALL_PLAN.halfD + MARKET_HALL_EAVE) * hallScale;
        for (let t = 0; t <= len; t += HALL_STREET_STEP) tries.push([s.from[0] + tx * t + nx * off, s.from[1] + tz * t + nz * off, Math.atan2(-nx, -nz)]);
      }
    }
    // Failing those, anywhere on the town's cells, facing the square or square to the town's axis.
    for (const h of plan.town.cells) {
      const [hx, , hz] = hexToWorld(h);
      for (let gx = -HALL_GRID_REACH; gx <= HALL_GRID_REACH + 1e-9; gx += HALL_GRID_STEP) {
        for (let gz = -HALL_GRID_REACH; gz <= HALL_GRID_REACH + 1e-9; gz += HALL_GRID_STEP) {
          const x = hx + gx;
          const z = hz + gz;
          const facing = Math.atan2(p.x - x, p.z - z);
          const axis = Math.atan2(-p.ux, -p.uz);
          tries.push([x, z, facing], [x, z, axis], [x, z, axis + Math.PI / 2]);
        }
      }
    }
    let hall: HallPlacement | undefined;
    for (const [x, z, yaw] of tries) {
      const foot = hallFoot({ x, z, yaw, scale: hallScale });
      const walls = hallFoot({ x, z, yaw, scale: hallScale }, false);
      const reach = Math.hypot(foot.halfW, foot.halfD);
      if (onTown(x, z, reach, Infinity)) continue;
      if (taken.some((t) => overlaps(t, foot, EAVE_GAP))) continue;
      if (onStreet(walls)) continue;
      if (crossesRiser(plan.plateau, rectCorners(walls), RETAINING_WALL_DEPTH * BUILDING_SCALE)) continue;
      const { bottom, top } = wallGround(ground, walls);
      if (bottom <= VILLAGE_DRY_HEIGHT) continue;
      if (onTown(x, z, reach, bottom)) continue;
      const y = top - HALL_SINK * hallScale;
      if (y - bottom > HALL_FOOTING * hallScale) continue;
      hall = { x, y, z, yaw, scale: hallScale };
      taken.push(foot);
      buildings.push(foot);
      break;
    }

    // 3. Cranes: beside a pier's root, the port's own first, on dry, level ground, the jib swung out towards the pier.
    const craneNext = stream(subSeed(worldSeed, SEED_FEATURES.cranes, plan.portId));
    const craneTarget = PORT_CRANES[0] + Math.floor(craneNext() * (PORT_CRANES[1] - PORT_CRANES[0] + 1));
    const firstSide = craneNext() < 0.5 ? 1 : -1;
    const scale = TOWN_PIECE_SCALE;
    const cranes: CranePlacement[] = [];
    let craneRoom = 0;
    for (const pier of [plan.pier, ...piers]) {
      const dx = Math.sin(pier.rotation);
      const dz = Math.cos(pier.rotation);
      const ax = -dz;
      const az = dx;
      for (const side of [firstSide, -firstSide]) {
        let found: CranePlacement | undefined;
        search: for (let inland = CRANE_INLAND[0] * scale; inland <= CRANE_INLAND[1] * scale + 1e-9; inland += CRANE_STEP * scale) {
          for (let out = CRANE_BESIDE[0] * scale; out <= CRANE_BESIDE[1] * scale + 1e-9; out += CRANE_STEP * scale) {
            const across = (PIER_WIDTH / 2) * pier.scale + CRANE_FOOT.half * scale + out;
            const x = pier.worldX + ax * across * side - dx * inland;
            const z = pier.worldZ + az * across * side - dz * inland;
            const yaw = pier.rotation + side * CRANE_SWING;
            const foot = craneFoot({ x, z, yaw, scale });
            const reach = Math.hypot(foot.halfW, foot.halfD);
            if (onTown(x, z, reach, Infinity)) continue;
            if (taken.some((t) => overlaps(t, foot, EAVE_GAP))) continue;
            if (onStreet(foot)) continue;
            if (crossesRiser(plan.plateau, rectCorners(foot), RETAINING_WALL_DEPTH * BUILDING_SCALE)) continue;
            const { bottom, top } = wallGround(ground, foot);
            if (bottom <= VILLAGE_DRY_HEIGHT) continue;
            const y = top - CRANE_SINK * scale;
            if (y - bottom > CRANE_FOOT.depth * scale * 0.9) continue;
            const tip = tipOf(x, y, z, yaw, scale);
            // The jib swings out over the water and the pier, never through a building.
            const jib: PlanRect = { x: (x + tip[0]) / 2, z: (z + tip[2]) / 2, fx: Math.sin(yaw), fz: Math.cos(yaw), halfW: CRANE_FOOT.half * scale * 0.5, halfD: Math.hypot(tip[0] - x, tip[2] - z) / 2 };
            if (buildings.some((b) => overlaps(b, jib, 0))) continue;
            found = { x, y, z, yaw, scale, tip };
            break search;
          }
        }
        if (!found) continue;
        craneRoom++;
        if (cranes.length >= craneTarget || cranes.some((c) => Math.hypot(c.x - found.x, c.z - found.z) < CRANE_SPACING)) continue;
        cranes.push(found);
        taken.push(craneFoot(found));
      }
    }

    // 4. Flags: the port's nation over its watchtower and on its quay.
    const flags: HarbourFlag[] = [];
    if (nation) {
      for (const b of kit) {
        if (b.kind !== "watchtower" || Math.hypot(b.worldX - plan.cx, b.worldZ - plan.cz) > 1) continue;
        const [hx, hz] = turn(b.worldX, b.worldZ, b.yaw, AGED_TOWER_FLAG_HOIST[0] * b.scale, AGED_TOWER_FLAG_HOIST[2] * b.scale);
        flags.push({ nation: b.nation ?? nation, mount: "tower", hoist: [hx, b.worldY + AGED_TOWER_FLAG_HOIST[1] * b.scale, hz], yaw: b.yaw, scale: b.scale });
      }
      for (const q of plan.quays) {
        const [fx, fz] = turn(q.worldX, q.worldZ, q.yaw, QUAY_FLAG_SPOT[0] * q.scaleX, QUAY_FLAG_SPOT[1] * q.scaleZ);
        const s = TOWN_PIECE_SCALE;
        const [hx, hz] = turn(fx, fz, q.yaw, QUAY_FLAG_HOIST[0] * s, QUAY_FLAG_HOIST[2] * s);
        flags.push({ nation, mount: "quay", hoist: [hx, q.top + QUAY_FLAG_HOIST[1] * s, hz], yaw: q.yaw, scale: s, foot: [fx, q.top, fz] });
      }
    }
    return { portId: plan.portId, piers, cranes, hall, flags, room: { piers: spots.length, cranes: craneRoom } };
  });
}

/**
 * The ports' plans with their furniture taken: its piers, cranes and hall
 * among the rectangles the clutter and the island's props keep clear of,
 * the hall's posts and the cranes' feet among the walls no kerb stands in.
 */
export function furnishedPlans(ports: readonly PortTownPlan[], furniture: readonly PortFurniture[]): PortTownPlan[] {
  return ports.map((plan) => {
    const f = furniture.find((x) => x.portId === plan.portId);
    if (!f) return plan;
    const grow = (r: PlanRect, m: number): PlanRect => ({ ...r, halfW: r.halfW + m, halfD: r.halfD + m });
    const margin = 0.01 * TOWN_PIECE_SCALE;
    const footprints = [...plan.footprints, ...f.piers.map((p) => grow(pierRect(p), margin)), ...f.cranes.map(craneFoot), ...(f.hall ? [hallFoot(f.hall)] : [])];
    const walls = [...plan.walls, ...f.cranes.map(craneFoot), ...(f.hall ? [hallFoot(f.hall, false)] : [])];
    return { ...plan, footprints, walls };
  });
}
