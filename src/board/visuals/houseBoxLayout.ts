/**
 * The #84 prototype's port village (throwaway): village buildings at the
 * #84 building scale, laid out round the port's own civic kit. Pure, no
 * Three.js; `HouseScaleBoxes.tsx` draws it as one merged mesh
 * (`villageMesh.ts`).
 *
 * - The square is where the port kit stands (tower, church, tavern), by the
 *   quay; the village keeps a civic margin clear round them.
 * - A short waterfront row of warehouses either side of the pier root,
 *   facing the water, set back to the first ground that takes them.
 * - On a town plateau (`&townGround=1`) the village lines the plateau's own
 *   streets (`townPlateau.ts`, carved into the ground): the merchant houses
 *   on the square, stone houses and cottages up the main street, cottages
 *   on the lanes, a lean-to against the odd house, a few houses at the
 *   plateau's edge. Nothing straddles a terrace riser and its wall.
 * - Without one, one main street runs inland from the square, wandering a
 *   little, with one or two side lanes branching off it, and houses thin
 *   out with distance from the square.
 *
 * Every building sits on the ground: it stands on the lowest ground under
 * its walls unless that would bury the uphill side by more than
 * `MAX_BURY`, and a spot that would show more than `MAX_FOOTING_SHOWN` of
 * footing on the downhill side is refused (on the beach, `BEACH_FOOTING` of
 * that, so a waterfront building never sits visibly askew). Nothing stands outside
 * the hex, on wet ground, on the quay, at the pier root, on a street, or
 * over another building.
 */
import type { MapCell } from "../../game/types";
import { hexToWorld, neighbors, type MapWrap } from "../../game/hex";
import { AGED_BUILDING_PLAN } from "./agedBuildingGeometry";
import type { GroundField } from "./groundPlacement";
import {
  PORT_BUILDING_SCALE_RANGE,
  PORT_BUILDING_TINT_SPREAD,
  SCALED_MAX_BURY,
  SCALED_MAX_FOOTING_SHOWN,
  type PortBuilding,
} from "./portSettlement";
import { quayTopAt, type QuayPlacement } from "./quayPlacement";
import { PIER_WIDTH } from "./pierGeometry";
import { SEA_LEVEL } from "./terrainHeightField";
import { BUILDING_SCALE, PROP_SCALE } from "./propScale";
import { lerpRange, seedOf, stream } from "./variationStream";
import {
  climbWeight,
  fortRoadDistance,
  KERB_WIDTH,
  plateauLocal,
  plateauPlanDistance,
  RETAINING_WALL_DEPTH,
  riserCentre,
  SHORE_KEEP_TOP,
  streetDistance,
  type TownPlateau,
  type TownStreet,
} from "./townPlateau";
import { VILLAGE_EAVE, VILLAGE_PLAN, type VillageVariant } from "./villageBuildingGeometry";

/** Every village length follows the buildings' scale; the pier's follow the prop scale. */
const K = BUILDING_SCALE;
const TAU = Math.PI * 2;
const SQRT3 = Math.sqrt(3);
/** At scale 1: how far the uphill side may sink into the ground, and how much footing may show downhill (as the port kit). */
const MAX_BURY = SCALED_MAX_BURY;
const MAX_FOOTING_SHOWN = SCALED_MAX_FOOTING_SHOWN;
/** On the beach (under this height) the footing may show only this share of the limit. */
const BEACH_TOP = SHORE_KEEP_TOP + 0.01;
const BEACH_FOOTING = 0.6;
const DRY_HEIGHT = SEA_LEVEL + 0.02 * K;
/** Clear margin round the port's own buildings: wide round the civic kit, narrower round its house and warehouse. */
const CIVIC_MARGIN = 0.1 * K;
const KIT_MARGIN = 0.04 * K;
/** Least gap between two buildings' eaves. */
const EAVE_GAP = 0.006 * K;

/** Waterfront warehouses: how many a port aims for, their spacing along the front, and how far inland they may set back. */
const WAREHOUSE_TARGET: readonly [number, number] = [3, 6];
const WAREHOUSE_SPACING = 0.02 * K;
const WAREHOUSE_SETBACK_MAX = 1.0 * K;
const WAREHOUSE_SETBACK_STEP = 0.02 * K;

/** Streets off the plateau: half width, the main street's length and the side lanes' (world units), in steps of `STREET_STEP`, wandering by up to `STREET_WANDER` a step. */
const STREET_HALF_WIDTH = 0.06 * K;
const MAIN_STREET_LENGTH: readonly [number, number] = [2.0 * K, 2.6 * K];
const LANE_LENGTH: readonly [number, number] = [0.9 * K, 1.5 * K];
const STREET_STEP = 0.12 * K;
const STREET_WANDER = 0.14;
/** Where the street starts beyond the square's centre. */
const SQUARE_RADIUS = 0.45 * K;
/** Gaps between houses along a street: usually narrow, sometimes a yard. */
const HOUSE_GAP: readonly [number, number] = [0.01 * K, 0.06 * K];
const YARD_CHANCE = 0.15;
const YARD_GAP: readonly [number, number] = [0.12 * K, 0.25 * K];
/** How far a house may sit back from the street edge. */
const SETBACK: readonly [number, number] = [0.005 * K, 0.04 * K];
/** Along a street, every house stands within this distance of the square; past it the chance of a house falls to `EDGE_KEEP`. */
const FULL_VILLAGE = 0.9 * K;
const EDGE_KEEP = 0.3;
/** Scattered houses at the edge: how many tries, and how far from the square. */
const SCATTER_TRIES = 30;
const SCATTER_TARGET: readonly [number, number] = [4, 8];
const SCATTER_RADIUS: readonly [number, number] = [1.2 * K, 2.8 * K];
/** Headings tried for the main street, as turns from straight inland (radians). */
const STREET_HEADINGS: readonly number[] = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9];
/** The ground a street's frontage is scored on: a house-sized probe this far either side of it. */
const FLAT_PROBE = 0.09 * K;
const STREET_PROBE_OFFSET = 0.15 * K;
/** Further setbacks a house tries when the frontage will not take it. */
const EXTRA_SETBACKS: readonly number[] = [0, 0.04 * K, 0.08 * K];
/** Back plots: tries, the street-and-plot village size they fill to, and how far behind the street edge they stand. */
const BACK_PLOT_TRIES = 3000;
const BACK_PLOT_TARGET = 40;
const BACK_PLOT_DEPTH: readonly [number, number] = [0.08 * K, 2.0 * K];
/** Most houses in one port. */
const MAX_HOUSES = 55;
const YAW_JITTER = 0.06;
const SALT = 0x2c6e9b13;

/** On a plateau: the gaps along a frontage, the odd yard, and how far a frontage may sit back. */
const PLATEAU_GAP: readonly [number, number] = [0.003 * K, 0.015 * K];
const PLATEAU_YARD_CHANCE = 0.08;
const PLATEAU_SETBACK: readonly [number, number] = [0, 0.012 * K];
/** Edge houses: how many a plateau aims for, tries, and how far into the blend they may stand (fraction of it). */
const PLATEAU_EDGE_TARGET: readonly [number, number] = [4, 8];
const PLATEAU_EDGE_TRIES = 200;
const PLATEAU_EDGE_REACH = 0.6;
/** Houses round the square: the ring's sweep either side of inland (radians), and how many of the first are merchants' houses. */
const SQUARE_SWEEP = 2.4;
const SQUARE_MERCHANTS = 2;
/** A lean-to against a cottage or stone house: how often, and the gap between them. */
const LEAN_TO_CHANCE = 0.3;
const LEAN_TO_GAP = 0.002 * K;

/** What the village keeps clear of and gathers round: the settlement as `decorationLayout` placed it. */
export interface PortKit {
  buildings: readonly PortBuilding[];
  quays: readonly QuayPlacement[];
  /** The piers' land ends. */
  piers: readonly { worldX: number; worldZ: number; rotation: number }[];
  /** The field's town plateaus (`&townGround=1`), if any. */
  plateaus?: readonly TownPlateau[];
}

/** A footprint in plan: centre, unit facing (local +z) and half extents across and along it, eaves included. */
export interface Footprint {
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

/** A street as the clutter sees it: a centre line and the half width of its running surface. */
export interface TownLane {
  line: readonly (readonly [number, number])[];
  halfWidth: number;
}

/** One port's village as laid out: what clutter must keep clear of and gathers round. */
export interface PortTownPlan {
  /** The hex centre. */
  cx: number;
  cz: number;
  square: { x: number; z: number };
  pier: { worldX: number; worldZ: number; rotation: number };
  quays: readonly QuayPlacement[];
  plateau?: TownPlateau;
  /** Every footprint taken: the kit's (with its margins), the fort's and the village's. */
  footprints: readonly Footprint[];
  streets: readonly TownLane[];
  buildings: readonly VillageBuilding[];
}

/** Whether two footprints, each grown by half the gap, overlap (separating axes). */
export function overlaps(a: Footprint, b: Footprint, gap: number): boolean {
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

/** A street from (x, z) heading `heading` (radians, 0 = +z), wandering a little each step. */
function street(x: number, z: number, heading: number, length: number, next: () => number, wander = STREET_WANDER): [number, number][] {
  const points: [number, number][] = [[x, z]];
  let h = heading;
  for (let d = 0; d < length; d += STREET_STEP) {
    h += (next() * 2 - 1) * wander;
    x += Math.sin(h) * STREET_STEP;
    z += Math.cos(h) * STREET_STEP;
    points.push([x, z]);
  }
  return points;
}

/** Stands a building if the ground and its neighbours allow; its footprint if placed. `attachedTo` is a footprint it may touch (a lean-to's house). */
type TryPlace = (variant: VillageVariant, x: number, z: number, yaw: number, scale: number, tint: number, attachedTo?: Footprint) => Footprint | undefined;

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
 * along both sides of every street the plateau laid, facing it, and a few
 * at the plateau's edge.
 */
function plateauVillage(
  p: TownPlateau,
  tryPlace: TryPlace,
  next: () => number,
  scaleRoll: () => number,
  tintRoll: () => number,
  jitter: () => number
): number {
  let houses = 0;
  const heading = Math.atan2(p.ux, p.uz);
  const ax = -p.uz;
  const az = p.ux;

  /** A lean-to against `house`'s side wall, flush with its back, sometimes. */
  const maybeLeanTo = (variant: VillageVariant, house: Footprint, yaw: number, scale: number) => {
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
    let along = lerpRange(PLATEAU_GAP, next());
    while (along < len && houses < MAX_HOUSES) {
      const first = pick(next, along / len);
      // A merchant's house that will not fit gives way to a stone house in the same plot.
      const choices: VillageVariant[] = first === "merchant" ? ["merchant", "stoneHouse"] : [first];
      const scale = scaleRoll();
      const tint = tintRoll();
      const yaw = Math.atan2(-nx, -nz) + jitter();
      const setback = lerpRange(PLATEAU_SETBACK, next());
      const yard = next() < PLATEAU_YARD_CHANCE;
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
          advance = 2 * halfW + (yard ? 2 * halfW : lerpRange(PLATEAU_GAP, gapRoll));
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
        step = (2 * halfW + lerpRange(PLATEAU_GAP, next())) / r;
        break;
      }
      step = Math.min(step, halfW / r);
    }
    a += step;
  }
  const main = p.streets.filter((s) => s.kind === "main");
  const cross = p.streets.filter((s) => s.kind === "cross");
  const back = p.streets.filter((s) => s.kind === "back");
  for (const s of main) for (const side of [1, -1]) frontage(s, side, pickMain);
  for (const s of cross) for (const side of [1, -1]) frontage(s, side, pickLane);
  for (const s of back) for (const side of [1, -1]) frontage(s, side, pickLane);

  // A few houses at the plateau's edge, turned any way.
  const edgeTarget = Math.round(lerpRange(PLATEAU_EDGE_TARGET, next()));
  let edge = 0;
  for (let i = 0; i < PLATEAU_EDGE_TRIES && edge < edgeTarget && houses < MAX_HOUSES; i++) {
    const s = next() * p.length;
    const across = (next() * 2 - 1) * (p.halfWidth + p.blend * PLATEAU_EDGE_REACH);
    const x = p.x + p.ux * s + ax * across;
    const z = p.z + p.uz * s + az * across;
    const d = plateauPlanDistance(p, x, z);
    if (d <= 0 || d > p.blend * PLATEAU_EDGE_REACH) continue;
    if (tryPlace("cottage", x, z, next() * TAU, scaleRoll(), tintRoll())) {
      edge++;
      houses++;
    }
  }
  return houses;
}

/** Why village spots were refused, counted across the last layout (a dev diagnostic). */
export const villageRejects: Record<string, number> = {};
const rejectFor = (reason: string): undefined => {
  villageRejects[reason] = (villageRejects[reason] ?? 0) + 1;
  return undefined;
};

/** Whether a footprint crosses one of the plateau's risers (and the retaining wall along it) where the wall stands. */
export function crossesRiser(p: TownPlateau, corners: readonly (readonly [number, number])[]): boolean {
  const local = corners.map(([x, z]) => plateauLocal(p, x, z));
  const s0 = Math.min(...local.map((l) => l.s));
  const s1 = Math.max(...local.map((l) => l.s));
  const a0 = Math.min(...local.map((l) => l.across));
  const a1 = Math.max(...local.map((l) => l.across));
  const reach = p.halfWidth + p.blend;
  if (a1 < -reach || a0 > reach) return false;
  // The riser's run under the footprint: the steep face, or the ramp where a street climbs it.
  const run = Math.max(...local.map((l) => p.riserFace + (p.ramp - p.riserFace) * climbWeight(p, l.across)));
  for (let k = 0; k < p.steps.length; k++) {
    const c = riserCentre(p, k);
    // The run and the wall standing at its foot.
    const lo = c - run / 2 - RETAINING_WALL_DEPTH * K;
    const hi = c + run / 2;
    if (s1 > lo && s0 < hi) return true;
  }
  return false;
}

/** The village on every port hex, standing on `ground`, and what each port's plan keeps clear; `seed` is the terrain seed. */
export function planPortTowns(cells: readonly MapCell[], ground: GroundField, kit: PortKit, seed = 0): { buildings: VillageBuilding[]; ports: PortTownPlan[] } {
  const town: VillageBuilding[] = [];
  const ports: PortTownPlan[] = [];
  for (const cell of cells) {
    if (!cell.hasPort) continue;
    const [cx, , cz] = hexToWorld(cell.hex);
    const near = <T extends { worldX: number; worldZ: number }>(items: readonly T[]) =>
      items.filter((i) => Math.hypot(i.worldX - cx, i.worldZ - cz) < 1);
    const kitHere = near(kit.buildings);
    const quays = near(kit.quays);
    const pier = near(kit.piers)[0];
    if (!pier) continue;
    // Towards the water (the pier's heading) and along the front.
    const dx = Math.sin(pier.rotation);
    const dz = Math.cos(pier.rotation);
    const ax = -dz;
    const az = dx;
    const toWater = pier.rotation;
    const edgeNormals = neighbors(cell.hex).map((n): [number, number] => {
      const [nx, , nz] = hexToWorld(n);
      return [(nx - cx) / SQRT3, (nz - cz) / SQRT3];
    });
    const next = stream(seedOf([cell.hex.q, cell.hex.r], SALT ^ seed));
    const here: VillageBuilding[] = [];

    // The square: the middle of the civic kit, else just inland of the pier root.
    const civic = kitHere.filter((b) => b.kind === "watchtower" || b.kind === "church" || b.kind === "tavern");
    const squareOf = civic.length > 0 ? civic : kitHere;
    const square =
      squareOf.length > 0
        ? { x: squareOf.reduce((s, b) => s + b.worldX, 0) / squareOf.length, z: squareOf.reduce((s, b) => s + b.worldZ, 0) / squareOf.length }
        : { x: pier.worldX - dx * SQUARE_RADIUS, z: pier.worldZ - dz * SQUARE_RADIUS };

    const placed: Footprint[] = kitHere.map((b) => {
      const plan = AGED_BUILDING_PLAN[b.kind];
      const margin = b.kind === "house" || b.kind === "warehouse" ? KIT_MARGIN : CIVIC_MARGIN;
      return {
        x: b.worldX,
        z: b.worldZ,
        fx: Math.sin(b.yaw),
        fz: Math.cos(b.yaw),
        halfW: (plan.halfW + 0.035) * b.scale + margin,
        halfD: (plan.halfD + 0.035) * b.scale + margin,
      };
    });
    const plateau = kit.plateaus?.find((p) => Math.hypot(p.x - cx, p.z - cz) < 1.2);
    // A fort port's fort (#84) is kept clear by the civic margin, as the kit's tower and church are.
    const fortHere = plateau?.fort;
    if (fortHere) {
      const half = fortHere.reach + CIVIC_MARGIN;
      placed.push({ x: fortHere.x, z: fortHere.z, fx: Math.sin(fortHere.yaw), fz: Math.cos(fortHere.yaw), halfW: half, halfD: half });
    }
    const streets: TownLane[] = [];
    if (plateau) {
      for (const s of plateau.streets) streets.push({ line: [s.from, s.to], halfWidth: s.halfWidth + KERB_WIDTH * K });
      if (plateau.fortRoad) streets.push({ line: plateau.fortRoad.points, halfWidth: plateau.fortRoad.halfWidth + plateau.fortRoad.shoulder * 0.5 });
    }

    const tryPlace: TryPlace = (variant, x, z, yaw, scale, tint, attachedTo) => {
      // Refusals are counted by reason, and by kind and reason.
      const reject = (reason: string): undefined => {
        villageRejects[`${variant}/${reason}`] = (villageRejects[`${variant}/${reason}`] ?? 0) + 1;
        return rejectFor(reason);
      };
      const plan = VILLAGE_PLAN[variant];
      const eave = VILLAGE_EAVE[variant];
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const foot: Footprint = { x, z, fx, fz, halfW: (plan.halfW + eave) * scale, halfD: (plan.halfD + eave) * scale };
      const reach = Math.hypot(foot.halfW, foot.halfD);
      if (!edgeNormals.every(([ux, uz]) => (x - cx) * ux + (z - cz) * uz <= SQRT3 / 2 - reach)) return reject("hex");
      if (Math.hypot(pier.worldX - x, pier.worldZ - z) < PIER_WIDTH * PROP_SCALE + reach) return reject("pier");
      if (placed.some((p) => p !== attachedTo && overlaps(p, foot, EAVE_GAP))) return reject("overlap");
      if (streets.some((s) => polylineDistance(x, z, s.line) < s.halfWidth + Math.min(foot.halfW, foot.halfD))) return reject("street");
      let top = -Infinity;
      let bottom = Infinity;
      const corners: [number, number][] = [];
      for (const u of [-1, 0, 1]) {
        for (const v of [-1, 0, 1]) {
          // Across the front is (fz, -fx) in the world, front to back is (fx, fz).
          const px = x + fz * u * plan.halfW * scale + fx * v * plan.halfD * scale;
          const pz = z - fx * u * plan.halfW * scale + fz * v * plan.halfD * scale;
          const h = ground.sampleHeight(px, pz);
          top = Math.max(top, h);
          bottom = Math.min(bottom, h);
          // The walls (not the eaves, which may overhang a retaining wall) must keep off a riser.
          corners.push([px, pz]);
          const ex = x + fz * u * foot.halfW + fx * v * foot.halfD;
          const ez = z - fx * u * foot.halfW + fz * v * foot.halfD;
          if (quays.some((q) => quayTopAt(q, { x: ex, z: ez }) !== undefined)) return reject("quay");
        }
      }
      if (bottom <= DRY_HEIGHT) return reject("wet");
      if (plateau && crossesRiser(plateau, corners)) return reject("riser");
      // On the ground: the lowest ground under the walls, unless that buries the uphill side too deep.
      // On the beach less footing may show, so no waterfront building stands visibly askew on its plinth.
      const beach = bottom < BEACH_TOP ? BEACH_FOOTING : 1;
      const y = Math.max(bottom, top - MAX_BURY * scale);
      if (y - bottom > MAX_FOOTING_SHOWN * scale * beach) return reject("plinth");
      placed.push(foot);
      const building: VillageBuilding = {
        kind: variant === "warehouse" ? "warehouse" : "house",
        variant,
        worldX: x,
        worldY: y,
        worldZ: z,
        yaw,
        scale,
        tint,
        roofTone: next(),
      };
      here.push(building);
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
      const along = side * (PIER_WIDTH * PROP_SCALE + warehouseWidth * (0.6 + Math.floor(slot / 2)) + WAREHOUSE_SPACING * Math.floor(slot / 2));
      const scale = scaleRoll();
      const tint = tintRoll();
      const yaw = toWater + jitter();
      // Gable end to the water (the doors), or (where the ground is narrower) long side to it.
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

    const finish = () =>
      ports.push({ cx, cz, square: plateau ? { x: plateau.x, z: plateau.z } : square, pier, quays, plateau, footprints: placed, streets, buildings: here });

    // On a town plateau (`&townGround=1`) the village lines its streets instead.
    if (plateau) {
      plateauVillage(plateau, tryPlace, next, scaleRoll, tintRoll, jitter);
      town.push(...here);
      finish();
      continue;
    }

    // 2. The main street inland from the square, and one or two lanes off it.
    // A street goes where the ground takes houses: of a few headings, the
    // one with the most house-flat ground along both its sides wins.
    const flatAt = (x: number, z: number): boolean => {
      if (!edgeNormals.every(([ux, uz]) => (x - cx) * ux + (z - cz) * uz <= SQRT3 / 2 - FLAT_PROBE * 1.5)) return false;
      let top = -Infinity;
      let bottom = Infinity;
      for (const u of [-1, 0, 1]) {
        for (const v of [-1, 0, 1]) {
          const h = ground.sampleHeight(x + u * FLAT_PROBE, z + v * FLAT_PROBE * 0.8);
          top = Math.max(top, h);
          bottom = Math.min(bottom, h);
        }
      }
      return bottom > DRY_HEIGHT && top - bottom <= (MAX_BURY + MAX_FOOTING_SHOWN) * K;
    };
    const streetScore = (line: readonly [number, number][]): number => {
      let score = 0;
      for (let i = 1; i < line.length; i++) {
        const [ax0, az0] = line[i - 1];
        const [bx0, bz0] = line[i];
        const len = Math.hypot(bx0 - ax0, bz0 - az0) || 1;
        const nx = (bz0 - az0) / len;
        const nz = -(bx0 - ax0) / len;
        for (const side of [1, -1]) if (flatAt(bx0 + nx * side * STREET_PROBE_OFFSET, bz0 + nz * side * STREET_PROBE_OFFSET)) score++;
      }
      return score;
    };
    const best = (candidates: [number, number][][]): [number, number][] =>
      candidates.reduce((a, b) => (streetScore(b) > streetScore(a) ? b : a));

    const landward = toWater + Math.PI;
    const mainLength = lerpRange(MAIN_STREET_LENGTH, next());
    const mains: [number, number][][] = [];
    for (const turn of STREET_HEADINGS) {
      const heading = landward + turn;
      const sx = square.x + Math.sin(heading) * SQUARE_RADIUS;
      const sz = square.z + Math.cos(heading) * SQUARE_RADIUS;
      mains.push(street(sx, sz, heading, mainLength, next));
    }
    const main = best(mains);
    const inland = Math.atan2(main[main.length - 1][0] - main[0][0], main[main.length - 1][1] - main[0][1]);
    const lanes: [number, number][][] = [];
    const laneCount = next() < 0.5 ? 1 : 2;
    for (let i = 0; i < laneCount; i++) {
      const length = lerpRange(LANE_LENGTH, next());
      const candidates: [number, number][][] = [];
      for (const at of [0.3, 0.45, 0.6, 0.75]) {
        const p = main[Math.min(main.length - 1, Math.floor(main.length * at))];
        for (const side of [1, -1]) for (const angle of [1.2, 1.6]) candidates.push(street(p[0], p[1], inland + side * angle, length, next));
      }
      // A second lane goes off the other side of the main street from the first.
      const allowed = i === 0 ? candidates : candidates.filter((c) => polylineDistance(c[c.length - 1][0], c[c.length - 1][1], lanes[0]) > LANE_LENGTH[0]);
      lanes.push(best(allowed.length > 0 ? allowed : candidates));
    }
    const lines = [main, ...lanes];
    for (const line of lines) streets.push({ line, halfWidth: STREET_HALF_WIDTH });

    // 3. Houses along both sides of each street, facing it, thinning away from the square.
    let houses = 0;
    for (const line of lines) {
      for (const side of [1, -1]) {
        let carry = lerpRange(HOUSE_GAP, next());
        for (let i = 1; i < line.length && houses < MAX_HOUSES; i++) {
          const [ax0, az0] = line[i - 1];
          const [bx0, bz0] = line[i];
          const segLen = Math.hypot(bx0 - ax0, bz0 - az0);
          const tx = (bx0 - ax0) / segLen;
          const tz = (bz0 - az0) / segLen;
          // The side's normal, pointing away from the street.
          const nx = tz * side;
          const nz = -tx * side;
          let along = carry;
          while (along < segLen && houses < MAX_HOUSES) {
            const variant = pickLane(next);
            const scale = scaleRoll();
            const tint = tintRoll();
            const gapRoll = next();
            const keepRoll = next();
            const setback = lerpRange(SETBACK, next());
            const halfW = (VILLAGE_PLAN[variant].halfW + VILLAGE_EAVE[variant]) * scale;
            const halfD = (VILLAGE_PLAN[variant].halfD + VILLAGE_EAVE[variant]) * scale;
            const px = ax0 + tx * (along + halfW);
            const pz = az0 + tz * (along + halfW);
            // The front (+z local) faces the street: back along the normal.
            const yaw = Math.atan2(-nx, -nz) + jitter();
            const fromSquare = Math.hypot(px - square.x, pz - square.z);
            const keep = fromSquare <= FULL_VILLAGE ? 1 : EDGE_KEEP + (1 - EDGE_KEEP) * Math.max(0, 1 - (fromSquare - FULL_VILLAGE) / FULL_VILLAGE);
            const gap = gapRoll < YARD_CHANCE ? lerpRange(YARD_GAP, next()) : lerpRange(HOUSE_GAP, next());
            // Set further back from the street if the ground at the frontage will not take it.
            const stands = () =>
              EXTRA_SETBACKS.some((extra) => {
                const off = STREET_HALF_WIDTH + halfD + setback + extra;
                return tryPlace(variant, px + nx * off, pz + nz * off, yaw, scale, tint) !== undefined;
              });
            if (keepRoll <= keep && stands()) {
              houses++;
              along += 2 * halfW + gap;
            } else {
              along += halfW + gap;
            }
          }
          carry = Math.max(0, along - segLen);
        }
      }
    }

    // 3b. Where the frontage was too steep, back plots: houses a little
    // further from a street, still facing it, on whatever ground is flat
    // enough, until the village reaches its size.
    for (let i = 0; i < BACK_PLOT_TRIES && houses < BACK_PLOT_TARGET; i++) {
      const line = lines[Math.min(lines.length - 1, Math.floor(next() * lines.length))];
      const seg = 1 + Math.min(line.length - 2, Math.floor(next() * (line.length - 1)));
      const [ax0, az0] = line[seg - 1];
      const [bx0, bz0] = line[seg];
      const segLen = Math.hypot(bx0 - ax0, bz0 - az0) || 1;
      const tx = (bx0 - ax0) / segLen;
      const tz = (bz0 - az0) / segLen;
      const side = next() < 0.5 ? 1 : -1;
      const nx = tz * side;
      const nz = -tx * side;
      const t = next() * segLen;
      const scale = scaleRoll();
      const variant = pickLane(next);
      const halfD = (VILLAGE_PLAN[variant].halfD + VILLAGE_EAVE[variant]) * scale;
      const off = STREET_HALF_WIDTH + halfD + lerpRange(BACK_PLOT_DEPTH, next());
      const x = ax0 + tx * t + nx * off;
      const z = az0 + tz * t + nz * off;
      const fromSquare = Math.hypot(x - square.x, z - square.z);
      const keep = fromSquare <= FULL_VILLAGE ? 1 : EDGE_KEEP + (1 - EDGE_KEEP) * Math.max(0, 1 - (fromSquare - FULL_VILLAGE) / FULL_VILLAGE);
      const keepRoll = next();
      if (keepRoll <= keep && tryPlace(variant, x, z, Math.atan2(-nx, -nz) + jitter(), scale, tintRoll())) houses++;
    }

    // 4. A few scattered houses at the village's edge, turned any way.
    const scatterTarget = Math.round(lerpRange(SCATTER_TARGET, next()));
    let scattered = 0;
    for (let i = 0; i < SCATTER_TRIES && scattered < scatterTarget && houses < MAX_HOUSES; i++) {
      const angle = inland + (next() * 2 - 1) * 1.6;
      const r = lerpRange(SCATTER_RADIUS, next());
      const x = square.x + Math.sin(angle) * r;
      const z = square.z + Math.cos(angle) * r;
      if (tryPlace("cottage", x, z, next() * TAU, scaleRoll(), tintRoll())) {
        scattered++;
        houses++;
      }
    }
    town.push(...here);
    finish();
  }
  return { buildings: town, ports };
}

/** The village on every port hex, standing on `ground`; `seed` is the terrain seed. */
export function portTown(cells: readonly MapCell[], ground: GroundField, _wrap: MapWrap, kit: PortKit, seed = 0): VillageBuilding[] {
  return planPortTowns(cells, ground, kit, seed).buildings;
}

/** Which footprints a fort port's road and streets leave the village (for tests): every street's distance from a footprint centre. */
export const streetClearance = (p: TownPlateau, x: number, z: number): number =>
  Math.min(...p.streets.map((s) => streetDistance(s, x, z) - s.halfWidth), p.fortRoad ? fortRoadDistance(p.fortRoad, x, z) - p.fortRoad.halfWidth : Infinity);
