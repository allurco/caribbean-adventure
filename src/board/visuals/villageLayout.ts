/**
 * The port village (#87, ADR 0003): about thirty houses round the port's
 * square and along the streets its town plateau carved (`townPlateau.ts`).
 * Pure, no Three.js; `villageGeometry.ts` merges it into one mesh.
 *
 * The port kit (`portSettlement.ts`: watchtower, church, tavern, house,
 * warehouse) stands on the square by the quay; the village gathers round it
 * and keeps a margin clear of it, so there is one set of buildings, not two:
 *
 * - A short waterfront row of warehouses either side of the pier root,
 *   facing the water, set back to the first ground that takes them.
 * - A ring of houses round the square facing its middle, the merchants'
 *   houses first.
 * - Houses shoulder to shoulder along both sides of every street, facing
 *   it: merchants' houses low on the main street, stone houses and cottages
 *   up it, cottages on the lanes, a lean-to against the odd house.
 * - A few cottages at the plateau's edge, turned any way.
 *
 * Every building stands on the ground (ADR 0002): on the lowest ground
 * under its walls unless that would bury the uphill side by more than
 * `VILLAGE_MAX_BURY`, and a spot that would show more than
 * `VILLAGE_MAX_FOOTING_SHOWN` of footing downhill is refused (on the beach
 * only near-level ground, `BEACH_MAX_SPREAD`, so no waterfront building
 * sits askew).
 * Nothing stands outside the hex, on wet ground, across a terrace riser or
 * its retaining wall, on a street, on the quay or the pier, or over another
 * building.
 */
import type { MapCell } from "../../game/types";
import { hexToWorld, neighbors } from "../../game/hex";
import { AGED_BUILDING_PLAN } from "./agedBuildingGeometry";
import type { GroundField } from "./groundPlacement";
import { PORT_BUILDING_SCALE_RANGE, PORT_BUILDING_TINT_SPREAD, plateauOfPort, type PortBuilding } from "./portSettlement";
import type { QuayPlacement } from "./quayPlacement";
import { QUAY_BACK, QUAY_SEA_FACE, QUAY_WIDTH } from "./quayGeometry";
import { PIER_LENGTH, PIER_WIDTH } from "./pierGeometry";
import { SEA_LEVEL } from "./terrainHeightField";
import { BUILDING_SCALE } from "./worldScale";
import { LAND_MESH_SPACING } from "./landMesh";
import { TOWN_REFINE } from "./townGround";
import { lerpRange, seedOf, stream } from "./variationStream";
import { crossesRiser, KERB_WIDTH, plateauPlanDistance, RETAINING_WALL_DEPTH, SHORE_KEEP_TOP, type TownPlateau, type TownStreet } from "./townPlateau";
import { VILLAGE_EAVE, VILLAGE_PLAN, type VillageVariant } from "./villageBuildingGeometry";

/** Every village length follows the buildings' scale. */
const K = BUILDING_SCALE;
const TAU = Math.PI * 2;
const SQRT3 = Math.sqrt(3);
/** At scale 1: how far a building's uphill side may sink into the ground, and how much footing may show downhill. */
export const VILLAGE_MAX_BURY = 0.05;
export const VILLAGE_MAX_FOOTING_SHOWN = 0.03;
/**
 * On the beach (walls on ground under this height) a building stands only
 * where the ground under its walls spans at most `BEACH_MAX_SPREAD` (at
 * scale 1, about a third of a metre at the building scale), on its lowest
 * point, so neither a buried uphill side nor a shown footing tilts it
 * against the sand's slope (#91: the beach used to take 60% of the usual
 * footing and the full bury, and houses there leant visibly).
 */
export const BEACH_TOP = SHORE_KEEP_TOP + 0.01;
export const BEACH_MAX_SPREAD = 0.015;
/** Lowest ground a building's walls may stand on. */
export const VILLAGE_DRY_HEIGHT = SEA_LEVEL + 0.02 * K;
/** Clear margin round the port kit's buildings: wide round the civic ones, narrower round its house and warehouse. */
const CIVIC_MARGIN = 0.1 * K;
const KIT_MARGIN = 0.04 * K;
/** How far past its walls a kit building's eaves reach, at scale 1. */
const KIT_EAVE = 0.035;
/** Least gap between two buildings' eaves. */
export const EAVE_GAP = 0.006 * K;
/** Clear margin round the quay and the pier deck. */
const QUAY_MARGIN = 0.01 * K;

/** Waterfront warehouses: how many a port aims for, their spacing along the front, and how far inland they may set back. */
const WAREHOUSE_TARGET: readonly [number, number] = [3, 6];
const WAREHOUSE_SPACING = 0.02 * K;
const WAREHOUSE_SETBACK_MAX = 1.0 * K;
const WAREHOUSE_SETBACK_STEP = 0.02 * K;
/** Most houses in one port. */
const MAX_HOUSES = 55;
const YAW_JITTER = 0.06;
const SALT = 0x2c6e9b13;
/** The gaps along a frontage, the odd yard, and how far a frontage may sit back. */
const FRONTAGE_GAP: readonly [number, number] = [0.003 * K, 0.015 * K];
const YARD_CHANCE = 0.08;
const SETBACK: readonly [number, number] = [0, 0.012 * K];
/** Edge houses: how many a plateau aims for, tries, and how far into the blend they may stand (fraction of it). */
const EDGE_TARGET: readonly [number, number] = [4, 8];
const EDGE_TRIES = 200;
const EDGE_REACH = 0.6;
/** Houses round the square: the ring's sweep either side of inland (radians), and how many of the first are merchants' houses. */
const SQUARE_SWEEP = 2.4;
const SQUARE_MERCHANTS = 2;
/** A lean-to against a cottage or stone house: how often, and the gap between them. */
const LEAN_TO_CHANCE = 0.3;
const LEAN_TO_GAP = 0.002 * K;

/** What the village keeps clear of and gathers round: the kit as `decorationLayout` placed it, and the field's towns. */
export interface PortKit {
  buildings: readonly PortBuilding[];
  quays: readonly QuayPlacement[];
  /** The piers, from their land ends. */
  piers: readonly { worldX: number; worldZ: number; rotation: number; scale: number }[];
  plateaus: readonly TownPlateau[];
}

/** A rectangle in plan: centre, unit facing (local +z) and half extents across and along it. */
export interface PlanRect {
  x: number;
  z: number;
  fx: number;
  fz: number;
  halfW: number;
  halfD: number;
}

/** A village building: the port kit's kind (house or warehouse) and which of the village's own models it is. */
export interface VillageBuilding extends PortBuilding {
  variant: VillageVariant;
  /** 0…1, picks its roof's colour (`villageMesh.ts`). */
  roofTone: number;
}

/** A street as the clutter sees it: a centre line and the half width of its running surface and kerbs. */
export interface TownLane {
  line: readonly (readonly [number, number])[];
  halfWidth: number;
}

/** One port's village as laid out: what its clutter must keep clear of and gathers round. */
export interface PortTownPlan {
  /** The hex centre. */
  cx: number;
  cz: number;
  plateau: TownPlateau;
  pier: { worldX: number; worldZ: number; rotation: number; scale: number };
  quays: readonly QuayPlacement[];
  /** Every rectangle taken: the kit's (with its margins), the quay's, the pier's and the village's. */
  footprints: readonly PlanRect[];
  /** Every building's walls, without eaves or margins: the kit's and the village's (no kerb stands in one). */
  walls: readonly PlanRect[];
  streets: readonly TownLane[];
  buildings: readonly VillageBuilding[];
}

/** Whether two rectangles, each grown by half the gap, overlap (separating axes). */
export function overlaps(a: PlanRect, b: PlanRect, gap: number): boolean {
  const axes: [number, number][] = [
    [a.fx, a.fz],
    [-a.fz, a.fx],
    [b.fx, b.fz],
    [-b.fz, b.fx],
  ];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [ux, uz] of axes) {
    const ra = (a.halfD + gap / 2) * Math.abs(a.fx * ux + a.fz * uz) + (a.halfW + gap / 2) * Math.abs(-a.fz * ux + a.fx * uz);
    const rb = (b.halfD + gap / 2) * Math.abs(b.fx * ux + b.fz * uz) + (b.halfW + gap / 2) * Math.abs(-b.fz * ux + b.fx * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
  }
  return true;
}

/** Distance from a point to a polyline. */
export function polylineDistance(x: number, z: number, line: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
}

/** A rectangle's corners, in the world. */
export function rectCorners(r: PlanRect): [number, number][] {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => [r.x + r.fz * u * r.halfW + r.fx * v * r.halfD, r.z - r.fx * u * r.halfW + r.fz * v * r.halfD]);
}

/** The walls' rectangle of a village building (its eaves left out). */
export const villageWalls = (b: VillageBuilding): PlanRect => ({
  x: b.worldX,
  z: b.worldZ,
  fx: Math.sin(b.yaw),
  fz: Math.cos(b.yaw),
  halfW: VILLAGE_PLAN[b.variant].halfW * b.scale,
  halfD: VILLAGE_PLAN[b.variant].halfD * b.scale,
});

/** The quay's body in plan (`quayTopAt`'s rectangle). */
export function quayRect(q: QuayPlacement): PlanRect {
  const fx = Math.sin(q.yaw);
  const fz = Math.cos(q.yaw);
  const mid = ((QUAY_BACK + QUAY_SEA_FACE) / 2) * q.scaleZ;
  return { x: q.worldX + fx * mid, z: q.worldZ + fz * mid, fx, fz, halfW: (QUAY_WIDTH / 2) * q.scaleX, halfD: ((QUAY_SEA_FACE - QUAY_BACK) / 2) * q.scaleZ };
}

/** The pier's deck in plan, from its land end out along its rotation (`Piers.tsx`). */
export function pierRect(p: { worldX: number; worldZ: number; rotation: number; scale: number }): PlanRect {
  const fx = Math.sin(p.rotation);
  const fz = Math.cos(p.rotation);
  const half = (PIER_LENGTH / 2) * p.scale;
  return { x: p.worldX + fx * half, z: p.worldZ + fz * half, fx, fz, halfW: (PIER_WIDTH / 2) * p.scale, halfD: half };
}

/** Stands a building if the ground and its neighbours allow; its rectangle (eaves included) if placed. `attachedTo` is one it may touch (a lean-to's house). */
type TryPlace = (variant: VillageVariant, x: number, z: number, yaw: number, scale: number, tint: number, attachedTo?: PlanRect) => PlanRect | undefined;

/** The kind of house a frontage gets, by where it is (`along`: 0 at the street's start, 1 at its end). */
type Pick = (next: () => number, along?: number) => VillageVariant;
const pickMain: Pick = (next, along = 1) => {
  const r = next();
  // Merchants' houses on the lower half of the street, stone houses up it, cottages among them.
  if (along < 0.6 && r < 0.3) return "merchant";
  return r < 0.65 ? "stoneHouse" : "cottage";
};
const pickLane: Pick = (next) => {
  const r = next();
  return r < 0.08 ? "merchant" : r < 0.38 ? "stoneHouse" : "cottage";
};

/**
 * The village on a town plateau: a ring of houses round the square facing
 * its middle (merchants' houses first), then houses shoulder to shoulder
 * along both sides of every street, facing it, and a few at the edge.
 */
function plateauVillage(p: TownPlateau, tryPlace: TryPlace, next: () => number, scaleRoll: () => number, tintRoll: () => number, jitter: () => number): void {
  let houses = 0;
  const heading = Math.atan2(p.ux, p.uz);

  /** A lean-to against `house`'s side wall, flush with its back, sometimes. */
  const maybeLeanTo = (variant: VillageVariant, house: PlanRect, yaw: number, scale: number) => {
    if ((variant !== "cottage" && variant !== "stoneHouse") || next() >= LEAN_TO_CHANCE) return;
    const side = next() < 0.5 ? 1 : -1;
    const wall = VILLAGE_PLAN[variant];
    const lean = VILLAGE_PLAN.leanTo;
    const across = (wall.halfW + lean.halfW) * scale + LEAN_TO_GAP;
    const back = (wall.halfD - lean.halfD) * scale;
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    if (tryPlace("leanTo", house.x + rx * across * side - fx * back, house.z + rz * across * side - fz * back, yaw, scale, tintRoll(), house)) houses++;
  };

  /** Houses shoulder to shoulder along one side of a street, facing it. */
  const frontage = (s: TownStreet, side: number, pick: Pick) => {
    const [x0, z0] = s.from;
    const [x1, z1] = s.to;
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const tx = (x1 - x0) / len;
    const tz = (z1 - z0) / len;
    const nx = tz * side;
    const nz = -tx * side;
    let along = lerpRange(FRONTAGE_GAP, next());
    while (along < len && houses < MAX_HOUSES) {
      const first = pick(next, along / len);
      // A merchant's house that will not fit gives way to a stone house in the same plot.
      const choices: VillageVariant[] = first === "merchant" ? ["merchant", "stoneHouse"] : [first];
      const scale = scaleRoll();
      const tint = tintRoll();
      const yaw = Math.atan2(-nx, -nz) + jitter();
      const setback = lerpRange(SETBACK, next());
      const yard = next() < YARD_CHANCE;
      const gapRoll = next();
      let advance = Infinity;
      for (const variant of choices) {
        const halfW = (VILLAGE_PLAN[variant].halfW + VILLAGE_EAVE[variant]) * scale;
        const halfD = (VILLAGE_PLAN[variant].halfD + VILLAGE_EAVE[variant]) * scale;
        const px = x0 + tx * (along + halfW);
        const pz = z0 + tz * (along + halfW);
        const off = s.halfWidth + KERB_WIDTH * K + halfD + setback;
        const placed = tryPlace(variant, px + nx * off, pz + nz * off, yaw, scale, tint);
        if (placed) {
          houses++;
          maybeLeanTo(variant, placed, yaw, scale);
          advance = 2 * halfW + (yard ? 2 * halfW : lerpRange(FRONTAGE_GAP, gapRoll));
          break;
        }
        advance = Math.min(advance, halfW * 0.5);
      }
      along += advance;
    }
  };

  // The square's ring first, facing its middle, then the main street's frontage, the cross lanes, the back lanes.
  const ringRadius = p.squareRadius * 0.85;
  let merchants = 0;
  for (let a = -SQUARE_SWEEP; a <= SQUARE_SWEEP && houses < MAX_HOUSES; ) {
    // A merchant's house where one fits, else a smaller house in the same slot.
    const choices: VillageVariant[] = merchants < SQUARE_MERCHANTS ? ["merchant", "stoneHouse"] : [next() < 0.5 ? "stoneHouse" : "cottage"];
    const scale = scaleRoll();
    const tint = tintRoll();
    const yawJitter = jitter();
    let step = Infinity;
    for (const variant of choices) {
      const halfW = (VILLAGE_PLAN[variant].halfW + VILLAGE_EAVE[variant]) * scale;
      const halfD = (VILLAGE_PLAN[variant].halfD + VILLAGE_EAVE[variant]) * scale;
      const dir = heading + a;
      const r = ringRadius + halfD;
      if (tryPlace(variant, p.x + Math.sin(dir) * r, p.z + Math.cos(dir) * r, dir + Math.PI + yawJitter, scale, tint)) {
        houses++;
        if (variant === "merchant") merchants++;
        step = (2 * halfW + lerpRange(FRONTAGE_GAP, next())) / r;
        break;
      }
      step = Math.min(step, halfW / r);
    }
    a += step;
  }
  for (const kind of ["main", "cross", "back"] as const) {
    for (const s of p.streets) if (s.kind === kind) for (const side of [1, -1]) frontage(s, side, kind === "main" ? pickMain : pickLane);
  }

  // A few cottages at the plateau's edge, turned any way.
  const ax = -p.uz;
  const az = p.ux;
  const edgeTarget = Math.round(lerpRange(EDGE_TARGET, next()));
  let edge = 0;
  for (let i = 0; i < EDGE_TRIES && edge < edgeTarget && houses < MAX_HOUSES; i++) {
    const s = next() * p.length;
    const across = (next() * 2 - 1) * (p.halfWidth + p.blend * EDGE_REACH);
    const x = p.x + p.ux * s + ax * across;
    const z = p.z + p.uz * s + az * across;
    const d = plateauPlanDistance(p, x, z);
    if (d <= 0 || d > p.blend * EDGE_REACH) continue;
    if (tryPlace("cottage", x, z, next() * TAU, scaleRoll(), tintRoll())) {
      edge++;
      houses++;
    }
  }
}

/** Most room between probes under a building's walls: under the refined town ground's pitch (`LAND_MESH_SPACING / TOWN_REFINE`). */
const WALL_PROBE_STEP = LAND_MESH_SPACING / TOWN_REFINE / 1.5;

/** The ground under a building's walls (a grid over its rectangle at `WALL_PROBE_STEP` and the drawn surface's creases within it): lowest and highest. */
export function wallGround(ground: GroundField, walls: PlanRect): { bottom: number; top: number } {
  let top = -Infinity;
  let bottom = Infinity;
  const probe = (x: number, z: number) => {
    const h = ground.sampleHeight(x, z);
    top = Math.max(top, h);
    bottom = Math.min(bottom, h);
  };
  const across = Math.max(3, Math.ceil((2 * walls.halfW) / WALL_PROBE_STEP) + 1);
  const along = Math.max(3, Math.ceil((2 * walls.halfD) / WALL_PROBE_STEP) + 1);
  for (let i = 0; i < across; i++) {
    const u = (i / (across - 1)) * 2 - 1;
    for (let j = 0; j < along; j++) {
      const v = (j / (along - 1)) * 2 - 1;
      probe(walls.x + walls.fz * u * walls.halfW + walls.fx * v * walls.halfD, walls.z - walls.fx * u * walls.halfW + walls.fz * v * walls.halfD);
    }
  }
  const reach = Math.hypot(walls.halfW, walls.halfD);
  for (const c of ground.creasesWithin?.(walls.x, walls.z, reach) ?? []) {
    const dx = c.x - walls.x;
    const dz = c.z - walls.z;
    if (Math.abs(dx * walls.fz - dz * walls.fx) <= walls.halfW && Math.abs(dx * walls.fx + dz * walls.fz) <= walls.halfD) probe(c.x, c.z);
  }
  return { bottom, top };
}

/**
 * The ground contact of a building of `scale` whose walls stand on ground
 * from `bottom` to `top`: the lowest ground, unless that would bury the
 * uphill side by more than `VILLAGE_MAX_BURY`; undefined where that would
 * show more than `VILLAGE_MAX_FOOTING_SHOWN` of footing. On the beach, the
 * lowest ground, and undefined where the ground spans more than
 * `BEACH_MAX_SPREAD`.
 */
export function villageStance(bottom: number, top: number, scale: number): number | undefined {
  if (bottom < BEACH_TOP) return top - bottom > BEACH_MAX_SPREAD * scale ? undefined : bottom;
  const y = Math.max(bottom, top - VILLAGE_MAX_BURY * scale);
  return y - bottom > VILLAGE_MAX_FOOTING_SHOWN * scale ? undefined : y;
}

/** The village on every port hex with a town plateau, standing on `ground` (the drawn land), and each port's plan; `seed` is the terrain seed. */
export function planPortTowns(cells: readonly MapCell[], ground: GroundField, kit: PortKit, seed: number): { buildings: VillageBuilding[]; ports: PortTownPlan[] } {
  const town: VillageBuilding[] = [];
  const ports: PortTownPlan[] = [];
  for (const cell of cells) {
    if (!cell.hasPort) continue;
    const plateau = plateauOfPort(cell, kit.plateaus);
    const [cx, , cz] = hexToWorld(cell.hex);
    const near = <T extends { worldX: number; worldZ: number }>(items: readonly T[]) => items.filter((i) => Math.hypot(i.worldX - cx, i.worldZ - cz) < 1);
    const pier = near(kit.piers)[0];
    if (!plateau || !pier) continue;
    const kitHere = near(kit.buildings);
    const quays = near(kit.quays);
    const dx = Math.sin(pier.rotation);
    const dz = Math.cos(pier.rotation);
    const ax = -dz;
    const az = dx;
    const edgeNormals = neighbors(cell.hex).map((n): [number, number] => {
      const [nx, , nz] = hexToWorld(n);
      return [(nx - cx) / SQRT3, (nz - cz) / SQRT3];
    });
    const next = stream(seedOf([cell.hex.q, cell.hex.r], SALT ^ seed));
    const here: VillageBuilding[] = [];

    // Taken already: the kit's buildings with their margins, the quay and the pier deck.
    const placed: PlanRect[] = kitHere.map((b) => {
      const plan = AGED_BUILDING_PLAN[b.kind];
      const margin = b.kind === "house" || b.kind === "warehouse" ? KIT_MARGIN : CIVIC_MARGIN;
      return { x: b.worldX, z: b.worldZ, fx: Math.sin(b.yaw), fz: Math.cos(b.yaw), halfW: (plan.halfW + KIT_EAVE) * b.scale + margin, halfD: (plan.halfD + KIT_EAVE) * b.scale + margin };
    });
    const grow = (r: PlanRect, m: number): PlanRect => ({ ...r, halfW: r.halfW + m, halfD: r.halfD + m });
    for (const q of quays) placed.push(grow(quayRect(q), QUAY_MARGIN));
    placed.push(grow(pierRect(pier), QUAY_MARGIN));
    const streets: TownLane[] = plateau.streets.map((s) => ({ line: [s.from, s.to], halfWidth: s.halfWidth + KERB_WIDTH * K }));

    const tryPlace: TryPlace = (variant, x, z, yaw, scale, tint, attachedTo) => {
      const plan = VILLAGE_PLAN[variant];
      const eave = VILLAGE_EAVE[variant];
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const foot: PlanRect = { x, z, fx, fz, halfW: (plan.halfW + eave) * scale, halfD: (plan.halfD + eave) * scale };
      const reach = Math.hypot(foot.halfW, foot.halfD);
      if (!edgeNormals.every(([ux, uz]) => (x - cx) * ux + (z - cz) * uz <= SQRT3 / 2 - reach)) return undefined;
      if (placed.some((p) => p !== attachedTo && overlaps(p, foot, EAVE_GAP))) return undefined;
      const walls: PlanRect = { x, z, fx, fz, halfW: plan.halfW * scale, halfD: plan.halfD * scale };
      // The walls keep off the streets' running surface and kerbs (the eaves may overhang them).
      if (streets.some((s) => rectCorners(walls).some(([px, pz]) => polylineDistance(px, pz, s.line) < s.halfWidth) || polylineDistance(x, z, s.line) < s.halfWidth + Math.min(walls.halfW, walls.halfD)))
        return undefined;
      // The walls, not the eaves (which may overhang a retaining wall), keep off a riser.
      if (crossesRiser(plateau, rectCorners(walls), RETAINING_WALL_DEPTH * K)) return undefined;
      const { bottom, top } = wallGround(ground, walls);
      if (bottom <= VILLAGE_DRY_HEIGHT) return undefined;
      const y = villageStance(bottom, top, scale);
      if (y === undefined) return undefined;
      placed.push(foot);
      here.push({ kind: variant === "warehouse" ? "warehouse" : "house", variant, worldX: x, worldY: y, worldZ: z, yaw, scale, tint, roofTone: next() });
      return foot;
    };
    const scaleRoll = () => lerpRange(PORT_BUILDING_SCALE_RANGE, next()) * K;
    const tintRoll = () => 1 + (next() * 2 - 1) * PORT_BUILDING_TINT_SPREAD;
    const jitter = () => (next() * 2 - 1) * YAW_JITTER;

    // 1. The waterfront warehouses, either side of the pier root, facing the water.
    const warehouseTarget = Math.round(lerpRange(WAREHOUSE_TARGET, next()));
    let warehouses = 0;
    const warehouseWidth = (VILLAGE_PLAN.warehouse.halfW + VILLAGE_EAVE.warehouse) * 2 * K;
    for (let slot = 0; slot < 12 && warehouses < warehouseTarget; slot++) {
      const side = slot % 2 === 0 ? 1 : -1;
      const along = side * (PIER_WIDTH * pier.scale + warehouseWidth * (0.6 + Math.floor(slot / 2)) + WAREHOUSE_SPACING * Math.floor(slot / 2));
      const scale = scaleRoll();
      const tint = tintRoll();
      const yaw = pier.rotation + jitter();
      // Gable end to the water (the doors), or, where the ground is narrower, long side to it.
      search: for (let back = 0; back <= WAREHOUSE_SETBACK_MAX; back += WAREHOUSE_SETBACK_STEP) {
        const x = pier.worldX + ax * along - dx * back;
        const z = pier.worldZ + az * along - dz * back;
        for (const turn of [0, Math.PI / 2]) {
          if (tryPlace("warehouse", x, z, yaw + turn, scale, tint)) {
            warehouses++;
            break search;
          }
        }
      }
    }

    // 2. The square's ring, the streets' frontages and the edge.
    plateauVillage(plateau, tryPlace, next, scaleRoll, tintRoll, jitter);
    town.push(...here);
    const walls: PlanRect[] = kitHere.map((b) => ({
      x: b.worldX,
      z: b.worldZ,
      fx: Math.sin(b.yaw),
      fz: Math.cos(b.yaw),
      halfW: AGED_BUILDING_PLAN[b.kind].halfW * b.scale,
      halfD: AGED_BUILDING_PLAN[b.kind].halfD * b.scale,
    }));
    walls.push(...here.map(villageWalls));
    ports.push({ cx, cz, plateau, pier, quays, footprints: placed, walls, streets, buildings: here });
  }
  return { buildings: town, ports };
}
