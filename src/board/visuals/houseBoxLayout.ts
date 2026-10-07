/**
 * The #84 prototype's port village (throwaway): the aged kit's house and
 * warehouse at the #84 prop scale, laid out as a village round the port's
 * own civic kit. Pure, no Three.js; `HouseScaleBoxes.tsx` draws it with the
 * port kit's instanced meshes.
 *
 * - The square is where the port kit stands (tower, church, tavern), by the
 *   quay; the village keeps a civic margin clear round them.
 * - A short waterfront row of warehouses either side of the pier root,
 *   facing the water, set back to the first ground that takes them.
 * - One main street runs inland from the square, wandering a little, with
 *   one or two side lanes branching off it. Houses line both sides facing
 *   the street, with irregular gaps and the odd yard, and thin out with
 *   distance from the square; a few scattered houses finish the edge.
 *
 * Every building sits on the ground: it stands on the lowest ground under
 * its walls unless that would bury the uphill side by more than
 * `MAX_BURY`, and a spot that would show more than `MAX_FOOTING_SHOWN` of
 * footing on the downhill side is refused. Nothing stands outside the hex,
 * on wet ground, on the quay, at the pier root, on a street, or over
 * another building.
 */
import type { MapCell } from "../../game/types";
import { hexToWorld, neighbors, type MapWrap } from "../../game/hex";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_PLAN } from "./agedBuildingGeometry";
import type { BuildingKind } from "./buildingGeometry";
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
import { plateauPlanDistance, type TownPlateau } from "./townPlateau";

/** Every village length follows the buildings' scale; the pier's follow the prop scale. */
const K = BUILDING_SCALE;
const TAU = Math.PI * 2;
const SQRT3 = Math.sqrt(3);
/** Past the walls on every side: the roof's overhang plus the lean, at scale 1. */
const EAVE_MARGIN = 0.035;
/** At scale 1: how far the uphill side may sink into the ground, and how much footing may show downhill (as the port kit). */
const MAX_BURY = SCALED_MAX_BURY;
const MAX_FOOTING_SHOWN = SCALED_MAX_FOOTING_SHOWN;
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

/** Streets: half width, the main street's length and the side lanes' (world units), in steps of `STREET_STEP`, wandering by up to `STREET_WANDER` a step. */
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
interface Footprint {
  x: number;
  z: number;
  fx: number;
  fz: number;
  halfW: number;
  halfD: number;
}

/** Whether two footprints, each grown by half the gap, overlap (separating axes). */
function overlaps(a: Footprint, b: Footprint, gap: number): boolean {
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
function polylineDistance(x: number, z: number, line: readonly [number, number][]): number {
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

/** On a plateau: the main street's wander per step, the gaps along a frontage, the odd yard, and how far a frontage may sit back. */
const PLATEAU_WANDER = 0.035;
const PLATEAU_GAP: readonly [number, number] = [0.003 * K, 0.015 * K];
const PLATEAU_YARD_CHANCE = 0.06;
const PLATEAU_SETBACK: readonly [number, number] = [0, 0.012 * K];
/** Lanes across the plateau off the main street: where along it they branch (fractions of its length). */
const PLATEAU_LANE_AT: readonly number[] = [0.4, 0.75];
/** Edge houses: how many a plateau aims for, tries, and how far into the blend they may stand (fraction of it). */
const PLATEAU_EDGE_TARGET: readonly [number, number] = [4, 8];
const PLATEAU_EDGE_TRIES = 200;
const PLATEAU_EDGE_REACH = 0.6;
/** Houses round the square: the ring's sweep either side of inland (radians). */
const SQUARE_SWEEP = 2.4;

type TryPlace = (kind: BuildingKind, x: number, z: number, yaw: number, scale: number, tint: number) => boolean;

/**
 * The village on a town plateau: a main street straight up the terraces
 * from the square, a back lane either side of it and one or two lanes
 * across, houses shoulder to shoulder along every frontage, a ring of
 * houses round the square, and a few at the plateau's edge.
 */
function plateauVillage(
  p: TownPlateau,
  tryPlace: TryPlace,
  streets: [number, number][][],
  next: () => number,
  scaleRoll: () => number,
  tintRoll: () => number,
  jitter: () => number
): number {
  let houses = 0;
  const heading = Math.atan2(p.ux, p.uz);
  const ax = -p.uz;
  const az = p.ux;
  const houseHalfD = (AGED_BUILDING_PLAN.house.halfD + EAVE_MARGIN) * PORT_BUILDING_SCALE_RANGE[1] * K;
  const start = p.squareRadius * 0.6;
  const main = street(p.x + p.ux * start, p.z + p.uz * start, heading, p.length - start, next, PLATEAU_WANDER);
  // Back lanes parallel to the main street, a pair of house depths out either side.
  const backOffset = 2 * STREET_HALF_WIDTH + 4 * houseHalfD + PLATEAU_GAP[1];
  const backLanes = [1, -1].map((side) => main.map(([x, z]): [number, number] => [x + ax * side * backOffset, z + az * side * backOffset]));
  const lanes: [number, number][][] = [];
  for (const at of PLATEAU_LANE_AT.slice(0, next() < 0.5 ? 1 : 2)) {
    const [lx, lz] = main[Math.min(main.length - 1, Math.floor(main.length * at))];
    const side = next() < 0.5 ? 1 : -1;
    lanes.push(street(lx, lz, heading + side * Math.PI / 2, p.halfWidth, next, PLATEAU_WANDER));
  }
  streets.push(main, ...backLanes, ...lanes);

  /** Houses shoulder to shoulder along one side of a street, facing it. */
  const frontage = (line: readonly [number, number][], side: number) => {
    let carry = lerpRange(PLATEAU_GAP, next());
    for (let i = 1; i < line.length && houses < MAX_HOUSES; i++) {
      const [x0, z0] = line[i - 1];
      const [x1, z1] = line[i];
      const segLen = Math.hypot(x1 - x0, z1 - z0) || 1;
      const tx = (x1 - x0) / segLen;
      const tz = (z1 - z0) / segLen;
      const nx = tz * side;
      const nz = -tx * side;
      let along = carry;
      while (along < segLen && houses < MAX_HOUSES) {
        const scale = scaleRoll();
        const tint = tintRoll();
        const halfW = (AGED_BUILDING_PLAN.house.halfW + EAVE_MARGIN) * scale;
        const halfD = (AGED_BUILDING_PLAN.house.halfD + EAVE_MARGIN) * scale;
        const gap = next() < PLATEAU_YARD_CHANCE ? 2 * halfW : lerpRange(PLATEAU_GAP, next());
        const setback = lerpRange(PLATEAU_SETBACK, next());
        const px = x0 + tx * (along + halfW);
        const pz = z0 + tz * (along + halfW);
        const yaw = Math.atan2(-nx, -nz) + jitter();
        const off = STREET_HALF_WIDTH + halfD + setback;
        if (tryPlace("house", px + nx * off, pz + nz * off, yaw, scale, tint)) {
          houses++;
          along += 2 * halfW + gap;
        } else {
          along += halfW * 0.5;
        }
      }
      carry = Math.max(0, along - segLen);
    }
  };

  // The square's ring first, facing its middle, then the main street's frontage, the lanes, the back lanes.
  const ringRadius = p.squareRadius * 0.85;
  for (let a = -SQUARE_SWEEP; a <= SQUARE_SWEEP && houses < MAX_HOUSES; ) {
    const scale = scaleRoll();
    const halfW = (AGED_BUILDING_PLAN.house.halfW + EAVE_MARGIN) * scale;
    const halfD = (AGED_BUILDING_PLAN.house.halfD + EAVE_MARGIN) * scale;
    const dir = heading + a;
    const r = ringRadius + halfD;
    const x = p.x + Math.sin(dir) * r;
    const z = p.z + Math.cos(dir) * r;
    if (tryPlace("house", x, z, dir + Math.PI + jitter(), scale, tintRoll())) {
      houses++;
      a += (2 * halfW + lerpRange(PLATEAU_GAP, next())) / r;
    } else {
      a += halfW / r;
    }
  }
  for (const side of [1, -1]) frontage(main, side);
  for (const lane of lanes) for (const side of [1, -1]) frontage(lane, side);
  backLanes.forEach((lane, i) => {
    const outward = i === 0 ? 1 : -1;
    for (const side of [-outward, outward]) frontage(lane, side);
  });

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
    if (tryPlace("house", x, z, next() * TAU, scaleRoll(), tintRoll())) {
      edge++;
      houses++;
    }
  }
  return houses;
}

/** Why village spots were refused, counted across the last layout (a dev diagnostic). */
export const villageRejects: Record<string, number> = {};
const reject = (reason: string): false => {
  villageRejects[reason] = (villageRejects[reason] ?? 0) + 1;
  return false;
};

/** The village on every port hex, standing on `ground`; `seed` is the terrain seed. */
export function portTown(cells: readonly MapCell[], ground: GroundField, _wrap: MapWrap, kit: PortKit, seed = 0): PortBuilding[] {
  const town: PortBuilding[] = [];
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
        halfW: (plan.halfW + EAVE_MARGIN) * b.scale + margin,
        halfD: (plan.halfD + EAVE_MARGIN) * b.scale + margin,
      };
    });
    // A fort port's fort (#84) is kept clear by the civic margin, as the kit's tower and church are.
    const fortHere = kit.plateaus?.find((p) => Math.hypot(p.x - cx, p.z - cz) < 1.2)?.fort;
    if (fortHere) {
      const half = fortHere.reach + CIVIC_MARGIN;
      placed.push({ x: fortHere.x, z: fortHere.z, fx: Math.sin(fortHere.yaw), fz: Math.cos(fortHere.yaw), halfW: half, halfD: half });
    }
    const streets: [number, number][][] = [];

    /** Stands `kind` at (x, z) facing `yaw` if the ground and its neighbours allow; true if placed. */
    const tryPlace = (kind: BuildingKind, x: number, z: number, yaw: number, scale: number, tint: number): boolean => {
      const plan = AGED_BUILDING_PLAN[kind];
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const foot: Footprint = { x, z, fx, fz, halfW: (plan.halfW + EAVE_MARGIN) * scale, halfD: (plan.halfD + EAVE_MARGIN) * scale };
      const reach = AGED_BUILDING_HALF_DIAGONAL[kind] * scale;
      if (!edgeNormals.every(([ux, uz]) => (x - cx) * ux + (z - cz) * uz <= SQRT3 / 2 - reach)) return reject("hex");
      if (Math.hypot(pier.worldX - x, pier.worldZ - z) < PIER_WIDTH * PROP_SCALE + reach) return reject("pier");
      if (placed.some((p) => overlaps(p, foot, EAVE_GAP))) return reject("overlap");
      if (streets.some((line) => polylineDistance(x, z, line) < STREET_HALF_WIDTH + Math.min(foot.halfW, foot.halfD))) return reject("street");
      let top = -Infinity;
      let bottom = Infinity;
      for (const u of [-1, 0, 1]) {
        for (const v of [-1, 0, 1]) {
          // Across the front is (fz, -fx) in the world, front to back is (fx, fz).
          const px = x + fz * u * plan.halfW * scale + fx * v * plan.halfD * scale;
          const pz = z - fx * u * plan.halfW * scale + fz * v * plan.halfD * scale;
          const h = ground.sampleHeight(px, pz);
          top = Math.max(top, h);
          bottom = Math.min(bottom, h);
          const ex = x + fz * u * foot.halfW + fx * v * foot.halfD;
          const ez = z - fx * u * foot.halfW + fz * v * foot.halfD;
          if (quays.some((q) => quayTopAt(q, { x: ex, z: ez }) !== undefined)) return reject("quay");
        }
      }
      if (bottom <= DRY_HEIGHT) return reject("wet");
      // On the ground: the lowest ground under the walls, unless that buries the uphill side too deep.
      const y = Math.max(bottom, top - MAX_BURY * scale);
      if (y - bottom > MAX_FOOTING_SHOWN * scale) return reject("plinth");
      placed.push(foot);
      town.push({ kind, worldX: x, worldY: y, worldZ: z, yaw, scale, tint });
      return true;
    };
    const scaleRoll = () => lerpRange(PORT_BUILDING_SCALE_RANGE, next()) * K;
    const tintRoll = () => 1 + (next() * 2 - 1) * PORT_BUILDING_TINT_SPREAD;
    const jitter = () => (next() * 2 - 1) * YAW_JITTER;

    // 1. The waterfront warehouses, either side of the pier root, facing the water.
    const warehouseTarget = Math.round(lerpRange(WAREHOUSE_TARGET, next()));
    let warehouses = 0;
    const warehouseWidth = (AGED_BUILDING_PLAN.warehouse.halfW + EAVE_MARGIN) * 2 * K;
    for (let slot = 0; slot < 12 && warehouses < warehouseTarget; slot++) {
      const side = slot % 2 === 0 ? 1 : -1;
      const along = side * (PIER_WIDTH * PROP_SCALE + warehouseWidth * (0.6 + Math.floor(slot / 2)) + WAREHOUSE_SPACING * Math.floor(slot / 2));
      const scale = scaleRoll();
      const tint = tintRoll();
      const yaw = toWater + jitter();
      // Long side to the water, or (where the ground is narrower) gable end to it.
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

    // On a town plateau (`&townGround=1`) the village packs onto its terraces instead.
    const plateau = kit.plateaus?.find((p) => Math.hypot(p.x - cx, p.z - cz) < 1.2);
    if (plateau) {
      plateauVillage(plateau, tryPlace, streets, next, scaleRoll, tintRoll, jitter);
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
    streets.push(main, ...lanes);

    // 3. Houses along both sides of each street, facing it, thinning away from the square.
    let houses = 0;
    for (const line of streets) {
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
            const scale = scaleRoll();
            const tint = tintRoll();
            const gapRoll = next();
            const keepRoll = next();
            const setback = lerpRange(SETBACK, next());
            const halfW = (AGED_BUILDING_PLAN.house.halfW + EAVE_MARGIN) * scale;
            const halfD = (AGED_BUILDING_PLAN.house.halfD + EAVE_MARGIN) * scale;
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
                return tryPlace("house", px + nx * off, pz + nz * off, yaw, scale, tint);
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
      const line = streets[Math.min(streets.length - 1, Math.floor(next() * streets.length))];
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
      const halfD = (AGED_BUILDING_PLAN.house.halfD + EAVE_MARGIN) * scale;
      const off = STREET_HALF_WIDTH + halfD + lerpRange(BACK_PLOT_DEPTH, next());
      const x = ax0 + tx * t + nx * off;
      const z = az0 + tz * t + nz * off;
      const fromSquare = Math.hypot(x - square.x, z - square.z);
      const keep = fromSquare <= FULL_VILLAGE ? 1 : EDGE_KEEP + (1 - EDGE_KEEP) * Math.max(0, 1 - (fromSquare - FULL_VILLAGE) / FULL_VILLAGE);
      const keepRoll = next();
      if (keepRoll <= keep && tryPlace("house", x, z, Math.atan2(-nx, -nz) + jitter(), scale, tintRoll())) houses++;
    }

    // 4. A few scattered houses at the village's edge, turned any way.
    const scatterTarget = Math.round(lerpRange(SCATTER_TARGET, next()));
    let scattered = 0;
    for (let i = 0; i < SCATTER_TRIES && scattered < scatterTarget && houses < MAX_HOUSES; i++) {
      const angle = inland + (next() * 2 - 1) * 1.6;
      const r = lerpRange(SCATTER_RADIUS, next());
      const x = square.x + Math.sin(angle) * r;
      const z = square.z + Math.cos(angle) * r;
      if (tryPlace("house", x, z, next() * TAU, scaleRoll(), tintRoll())) {
        scattered++;
        houses++;
      }
    }
  }
  return town;
}
