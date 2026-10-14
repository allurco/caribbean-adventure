/**
 * The port village (#87, #176, ADR 0006): about two dozen big houses
 * (`VILLAGE_HOUSES`) round the port's square and along the streets its town
 * plateau carved (`townPlateau.ts`), on the port's town cells.
 * Pure, no Three.js; `villageGeometry.ts` merges it into one mesh.
 *
 * The port kit (`portSettlement.ts`: watchtower, church, tavern, house,
 * warehouse) stands on the square by the quay; the village gathers round it
 * and keeps a margin clear of it, so there is one set of buildings, not two:
 *
 * - A short waterfront row of two-storey merchants' houses with their
 *   balconies either side of the pier root, facing the water, set back to
 *   the first ground that takes them (a warehouse where one will not fit).
 * - A ring of houses round the square facing its middle, the merchants'
 *   houses first.
 * - Houses shoulder to shoulder along both sides of every street, facing
 *   it: merchants' houses low on the main street, three-storey town houses,
 *   stone houses and cottages up it, cottages on the lanes, a lean-to
 *   against the odd house.
 * - A few cottages at the plateau's edge, turned any way.
 *
 * A town whose ground takes more than `VILLAGE_HOUSES` is thinned back to
 * it (its own sub-seed), the waterfront and the square's ring kept: a
 * thinned house (and its lean-to) frees its footprint for the clutter.
 *
 * Every building stands on the ground (ADR 0002): on the lowest ground
 * under its walls unless that would bury the uphill side by more than
 * `VILLAGE_MAX_BURY`, and a spot that would show more than
 * `VILLAGE_MAX_FOOTING_SHOWN` of footing downhill is refused (on the beach
 * only near-level ground, `BEACH_MAX_SPREAD`, so no waterfront building
 * sits askew).
 * Nothing stands outside the port's town cells (`townCells.ts`, #170: the
 * port cell and the neighbours its town spilled onto, ADR 0006), in the
 * shore band of a spilled cell, on wet ground, across a terrace riser or
 * its retaining wall, on a street, on the quay or the pier, or over another
 * building; every candidate dropped is counted under its reason
 * (`DROP_REASONS`). Every length follows the building scale.
 */
import type { MapCell } from "../../game/types";
import { hexToWorld } from "../../game/hex";
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
import { mapCellId, type PortId } from "./islands";
import { SEED_FEATURES } from "./seedFeatures";
import { stream, subSeed } from "./subSeed";
import { lerpRange } from "./variationStream";
import { crossesRiser, KERB_WIDTH, plateauPlanDistance, RETAINING_WALL_DEPTH, SHORE_KEEP_TOP, type TownPlateau, type TownStreet } from "./townPlateau";
import { VILLAGE_EAVE, VILLAGE_PLAN, type VillageVariant } from "./villageBuildingGeometry";
import type { TownCells } from "./townCells";
import { townCellsRule } from "./townBound";

/** Every village length follows the buildings' scale; this is the drawn one (`planPortTowns` takes another for tests). */
const K = BUILDING_SCALE;
const TAU = Math.PI * 2;
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
/** At scale 1: the lowest ground a building's walls may stand on, above the sea. */
const DRY = 0.02;
/** Lowest ground a building's walls may stand on, at the drawn building scale. */
export const VILLAGE_DRY_HEIGHT = SEA_LEVEL + DRY * K;
/** At scale 1: the clear margin round the port kit's buildings, wide round the civic ones, narrower round its house and warehouse. */
const CIVIC_MARGIN = 0.1;
const KIT_MARGIN = 0.04;
/** How far past its walls a kit building's eaves reach, at scale 1. */
const KIT_EAVE = 0.035;
/** At scale 1: the least gap between two buildings' eaves. */
const EAVE_GAP_1 = 0.006;
/** Least gap between two buildings' eaves, at the drawn building scale. */
export const EAVE_GAP = EAVE_GAP_1 * K;
/** At scale 1: the clear margin round the quay and the pier deck. */
const QUAY_MARGIN = 0.01;

/**
 * The standing buildings (lean-tos aside) a port's village aims for (#176):
 * about two dozen at ×2.5, so with the port kit a port stands 20 to 30.
 */
export const VILLAGE_HOUSES = 24;
/** Most a layout places before it thins back to `VILLAGE_HOUSES`, which bounds its work. */
const MAX_PLACED = 3 * VILLAGE_HOUSES;
/** Shares of `VILLAGE_HOUSES` the waterfront row and the edge cottages aim for: proportional, as the old 3–6 and 4–8 were of 55. */
const WATERFRONT_SHARE: readonly [number, number] = [0.08, 0.125];
const EDGE_SHARE: readonly [number, number] = [0.1, 0.2];
/** The waterfront row: at scale 1, the spacing along the front, and how far inland a building may set back. */
const WATERFRONT_SPACING = 0.02;
const WATERFRONT_SETBACK_MAX = 1.0;
const WATERFRONT_SETBACK_STEP = 0.02;
const YAW_JITTER = 0.06;
/** At scale 1: the gaps along a frontage and how far a frontage may sit back; and how often a plot is left as a yard. */
const FRONTAGE_GAP: readonly [number, number] = [0.003, 0.015];
const YARD_CHANCE = 0.08;
const SETBACK: readonly [number, number] = [0, 0.012];
/** Edge houses: how many tries, and how far into the blend they may stand (fraction of it). */
const EDGE_TRIES = 200;
const EDGE_REACH = 0.6;
/** Houses round the square: the ring's sweep either side of inland (radians), and how many of the first are merchants' houses. */
const SQUARE_SWEEP = 2.4;
const SQUARE_MERCHANTS = 2;
/** A lean-to against a cottage or stone house: how often, and the gap between them at scale 1. */
const LEAN_TO_CHANCE = 0.3;
const LEAN_TO_GAP = 0.002;

/** A pair of lengths at scale 1, at building scale `k`. */
const scaled = ([lo, hi]: readonly [number, number], k: number): readonly [number, number] => [lo * k, hi * k];
/** A target count, a share of `VILLAGE_HOUSES`, rounded. */
const targetOf = ([lo, hi]: readonly [number, number]): readonly [number, number] => [Math.round(lo * VILLAGE_HOUSES), Math.round(hi * VILLAGE_HOUSES)];
/** How many of a village's buildings stand on their own: every one but the lean-tos, which lean on a house. */
export const standingBuildings = (buildings: readonly VillageBuilding[]): number => buildings.filter((b) => b.variant !== "leanTo").length;

/**
 * Why a village candidate was not built (#170): every candidate a layout
 * tries is either built or dropped for one of these. The port's hex edge is
 * no longer one; the town's cells are.
 */
export const DROP_REASONS = [
  /** It would reach past the port's town cells (`townCells.ts`). */
  "outside town",
  /** On a cell the town spilled onto, it would stand in the shore band: the spill never takes the beach. */
  "shore band",
  /** Its eaves would meet the kit, the quay, the pier or another building. */
  "taken",
  /** Its walls would stand on a street or its kerbs. */
  "street",
  /** Its walls would cross a terrace riser or its retaining wall. */
  "riser",
  /** The ground under its walls dips to the water's edge. */
  "wet",
  /** The ground is too uneven: it would bury its uphill side or show too much footing. */
  "uneven",
  /** It stood, but the town took more than `VILLAGE_HOUSES` and was thinned (#176); a lean-to goes with its house. */
  "thinned",
] as const;
export type DropReason = (typeof DROP_REASONS)[number];

/** What the village keeps clear of and gathers round: the kit as `decorationLayout` placed it, and the field's towns. */
export interface PortKit {
  buildings: readonly PortBuilding[];
  quays: readonly QuayPlacement[];
  /** The piers, from their land ends, each its deck's `stretch` over the authored length. */
  piers: readonly PierPlan[];
  plateaus: readonly TownPlateau[];
}

/** A pier as the town sees it: its land end, heading, scale and how much its deck is stretched (1 when absent). */
export interface PierPlan {
  worldX: number;
  worldZ: number;
  rotation: number;
  scale: number;
  stretch?: number;
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
  /** In the waterfront row by the pier root, facing the water. */
  waterfront?: true;
}

/** A street as the clutter sees it: a centre line and the half width of its running surface and kerbs. */
export interface TownLane {
  line: readonly (readonly [number, number])[];
  halfWidth: number;
}

/** One port's village as laid out: what its clutter must keep clear of and gathers round. */
export interface PortTownPlan {
  /** The port's stable id (`islands.ts`), which the town's seeded details key off. */
  portId: PortId;
  /** The hex centre. */
  cx: number;
  cz: number;
  plateau: TownPlateau;
  pier: PierPlan;
  quays: readonly QuayPlacement[];
  /** Every rectangle taken: the kit's (with its margins), the quay's, the pier's and the village's. */
  footprints: readonly PlanRect[];
  /** Every building's walls, without eaves or margins: the kit's and the village's (no kerb stands in one). */
  walls: readonly PlanRect[];
  streets: readonly TownLane[];
  buildings: readonly VillageBuilding[];
  /** The port's town cells (#170): nothing of the village, the kit or the clutter stands outside them. */
  town: TownCells;
  /** How many candidates the layout tried, and how many it dropped for each reason; the rest were built. */
  tried: number;
  dropped: Readonly<Record<DropReason, number>>;
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
export function pierRect(p: PierPlan): PlanRect {
  const fx = Math.sin(p.rotation);
  const fz = Math.cos(p.rotation);
  const half = (PIER_LENGTH / 2) * p.scale * (p.stretch ?? 1);
  return { x: p.worldX + fx * half, z: p.worldZ + fz * half, fx, fz, halfW: (PIER_WIDTH / 2) * p.scale, halfD: half };
}

/** Where in the town a building was placed: what thinning keeps first (the waterfront, then the square's ring). */
type Role = "waterfront" | "ring" | "street" | "edge" | "leanTo";
/** Stands a building if the ground and its neighbours allow; its rectangle (eaves included) if placed. `attachedTo` is one it may touch (a lean-to's house). */
type TryPlace = (variant: VillageVariant, x: number, z: number, yaw: number, scale: number, tint: number, role: Role, attachedTo?: PlanRect) => PlanRect | undefined;
/** Which roles thinning drops first, last the ones it keeps longest. */
const THIN_ORDER: readonly Role[] = ["edge", "street", "ring", "waterfront"];

/** The kind of house a frontage gets, by where it is (`along`: 0 at the street's start, 1 at its end). */
type Pick = (next: () => number, along?: number) => VillageVariant;
const pickMain: Pick = (next, along = 1) => {
  const r = next();
  // Merchants' houses on the lower half of the street, town houses and stone houses up it, cottages among them.
  if (along < 0.6 && r < 0.25) return "merchant";
  return r < 0.5 ? "townHouse" : r < 0.78 ? "stoneHouse" : "cottage";
};
const pickLane: Pick = (next) => {
  const r = next();
  return r < 0.08 ? "merchant" : r < 0.25 ? "townHouse" : r < 0.55 ? "stoneHouse" : "cottage";
};

/**
 * The village on a town plateau: a ring of houses round the square facing
 * its middle (merchants' houses first), then houses shoulder to shoulder
 * along both sides of every street, facing it, and a few at the edge.
 */
function plateauVillage(p: TownPlateau, k: number, tryPlace: TryPlace, next: () => number, scaleRoll: () => number, tintRoll: () => number, jitter: () => number): void {
  let houses = 0;
  const frontageGap = scaled(FRONTAGE_GAP, k);
  const setbackRange = scaled(SETBACK, k);
  const heading = Math.atan2(p.ux, p.uz);

  /** A lean-to against `house`'s side wall, flush with its back, sometimes. */
  const maybeLeanTo = (variant: VillageVariant, house: PlanRect, yaw: number, scale: number) => {
    if ((variant !== "cottage" && variant !== "stoneHouse") || next() >= LEAN_TO_CHANCE) return;
    const side = next() < 0.5 ? 1 : -1;
    const wall = VILLAGE_PLAN[variant];
    const lean = VILLAGE_PLAN.leanTo;
    const across = (wall.halfW + lean.halfW) * scale + LEAN_TO_GAP * k;
    const back = (wall.halfD - lean.halfD) * scale;
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    if (tryPlace("leanTo", house.x + rx * across * side - fx * back, house.z + rz * across * side - fz * back, yaw, scale, tintRoll(), "leanTo", house)) houses++;
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
    let along = lerpRange(frontageGap, next());
    while (along < len && houses < MAX_PLACED) {
      const first = pick(next, along / len);
      // A merchant's house that will not fit gives way to a stone house in the same plot.
      const choices: VillageVariant[] = first === "merchant" ? ["merchant", "stoneHouse"] : [first];
      const scale = scaleRoll();
      const tint = tintRoll();
      const yaw = Math.atan2(-nx, -nz) + jitter();
      const setback = lerpRange(setbackRange, next());
      const yard = next() < YARD_CHANCE;
      const gapRoll = next();
      let advance = Infinity;
      for (const variant of choices) {
        const halfW = (VILLAGE_PLAN[variant].halfW + VILLAGE_EAVE[variant]) * scale;
        const halfD = (VILLAGE_PLAN[variant].halfD + VILLAGE_EAVE[variant]) * scale;
        const px = x0 + tx * (along + halfW);
        const pz = z0 + tz * (along + halfW);
        const off = s.halfWidth + KERB_WIDTH * k + halfD + setback;
        const placed = tryPlace(variant, px + nx * off, pz + nz * off, yaw, scale, tint, "street");
        if (placed) {
          houses++;
          maybeLeanTo(variant, placed, yaw, scale);
          advance = 2 * halfW + (yard ? 2 * halfW : lerpRange(frontageGap, gapRoll));
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
  for (let a = -SQUARE_SWEEP; a <= SQUARE_SWEEP && houses < MAX_PLACED; ) {
    // A merchant's house where one fits, else a smaller house in the same slot.
    const pickRing = next();
    const choices: VillageVariant[] = merchants < SQUARE_MERCHANTS ? ["merchant", "stoneHouse"] : [pickRing < 0.35 ? "townHouse" : pickRing < 0.7 ? "stoneHouse" : "cottage"];
    const scale = scaleRoll();
    const tint = tintRoll();
    const yawJitter = jitter();
    let step = Infinity;
    for (const variant of choices) {
      const halfW = (VILLAGE_PLAN[variant].halfW + VILLAGE_EAVE[variant]) * scale;
      const halfD = (VILLAGE_PLAN[variant].halfD + VILLAGE_EAVE[variant]) * scale;
      const dir = heading + a;
      const r = ringRadius + halfD;
      if (tryPlace(variant, p.x + Math.sin(dir) * r, p.z + Math.cos(dir) * r, dir + Math.PI + yawJitter, scale, tint, "ring")) {
        houses++;
        if (variant === "merchant") merchants++;
        step = (2 * halfW + lerpRange(frontageGap, next())) / r;
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
  const edgeTarget = Math.round(lerpRange(targetOf(EDGE_SHARE), next()));
  let edge = 0;
  for (let i = 0; i < EDGE_TRIES && edge < edgeTarget && houses < MAX_PLACED; i++) {
    const s = next() * p.length;
    const across = (next() * 2 - 1) * (p.halfWidth + p.blend * EDGE_REACH);
    const x = p.x + p.ux * s + ax * across;
    const z = p.z + p.uz * s + az * across;
    const d = plateauPlanDistance(p, x, z);
    if (d <= 0 || d > p.blend * EDGE_REACH) continue;
    if (tryPlace("cottage", x, z, next() * TAU, scaleRoll(), tintRoll(), "edge")) {
      edge++;
      houses++;
    }
  }
}

/** Most room between probes under a building's walls: under the refined town ground's pitch (`LAND_MESH_SPACING / TOWN_REFINE`). */
const WALL_PROBE_STEP = LAND_MESH_SPACING / TOWN_REFINE / 1.5;
/** How many times finer the walls' edges are probed than the grid inside them. */
const WALL_EDGE_REFINE = 8;

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
  // The walls' foot, finer: a piecewise-flat surface peaks inside the rectangle only at a crease, and on its edge
  // where a facet's edge crosses it, which a coarse lattice (off the refined town ground, where a town spills) leaves wide apart.
  const edgeAcross = (across - 1) * WALL_EDGE_REFINE + 1;
  const edgeAlong = (along - 1) * WALL_EDGE_REFINE + 1;
  for (let i = 0; i < edgeAcross; i++) {
    const u = (i / (edgeAcross - 1)) * 2 - 1;
    for (const v of [-1, 1]) probe(walls.x + walls.fz * u * walls.halfW + walls.fx * v * walls.halfD, walls.z - walls.fx * u * walls.halfW + walls.fz * v * walls.halfD);
  }
  for (let j = 0; j < edgeAlong; j++) {
    const v = (j / (edgeAlong - 1)) * 2 - 1;
    for (const u of [-1, 1]) probe(walls.x + walls.fz * u * walls.halfW + walls.fx * v * walls.halfD, walls.z - walls.fx * u * walls.halfW + walls.fz * v * walls.halfD);
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

/** How `planPortTowns` lays the villages out besides the drawn defaults. */
export interface PortTownOptions {
  /** The building scale (`BUILDING_SCALE` by default): every village length follows it. Tests vary it, with a field planned at the same scale. */
  buildingScale?: number;
}

/**
 * The village on every port with a town plateau, standing on `ground` (the
 * drawn land), and each port's plan; `worldSeed` is `G.mapSeed`. Nothing
 * stands outside the port's town cells (the plateau's, else the port cell
 * alone), and on a cell the town spilled onto nothing stands in the shore
 * band.
 */
export function planPortTowns(
  cells: readonly MapCell[],
  ground: GroundField,
  kit: PortKit,
  worldSeed: number,
  options: PortTownOptions = {}
): { buildings: VillageBuilding[]; ports: PortTownPlan[] } {
  const k = options.buildingScale ?? K;
  const dry = SEA_LEVEL + DRY * k;
  const eaveGap = EAVE_GAP_1 * k;
  const quayMargin = QUAY_MARGIN * k;
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
    const portId = mapCellId(cell);
    const cellsOfTown: TownCells = plateau.town ?? { portId, cells: [cell.hex] };
    const onTown = townCellsRule(cellsOfTown);
    const next = stream(subSeed(worldSeed, SEED_FEATURES.village, portId));
    const here: VillageBuilding[] = [];
    /** Per building in `here`: its eaves' rectangle, its role, and the house a lean-to leans on. */
    const meta: { foot: PlanRect; role: Role; house?: PlanRect }[] = [];
    const dropped = Object.fromEntries(DROP_REASONS.map((r) => [r, 0])) as Record<DropReason, number>;
    let tried = 0;

    // Taken already: the kit's buildings with their margins, the quay and the pier deck.
    const placed: PlanRect[] = kitHere.map((b) => {
      const plan = AGED_BUILDING_PLAN[b.kind];
      const margin = (b.kind === "house" || b.kind === "warehouse" ? KIT_MARGIN : CIVIC_MARGIN) * k;
      return { x: b.worldX, z: b.worldZ, fx: Math.sin(b.yaw), fz: Math.cos(b.yaw), halfW: (plan.halfW + KIT_EAVE) * b.scale + margin, halfD: (plan.halfD + KIT_EAVE) * b.scale + margin };
    });
    const grow = (r: PlanRect, m: number): PlanRect => ({ ...r, halfW: r.halfW + m, halfD: r.halfD + m });
    for (const q of quays) placed.push(grow(quayRect(q), quayMargin));
    placed.push(grow(pierRect(pier), quayMargin));
    const streets: TownLane[] = plateau.streets.map((s) => ({ line: [s.from, s.to], halfWidth: s.halfWidth + KERB_WIDTH * k }));

    /** Why a building may not stand here, or undefined (with its stance) if it may. */
    const refuse = (foot: PlanRect, walls: PlanRect, scale: number, attachedTo?: PlanRect): DropReason | { y: number } => {
      const reach = Math.hypot(foot.halfW, foot.halfD);
      if (onTown(foot.x, foot.z, reach, Infinity)) return "outside town";
      if (placed.some((p) => p !== attachedTo && overlaps(p, foot, eaveGap))) return "taken";
      // The walls keep off the streets' running surface and kerbs (the eaves may overhang them).
      if (streets.some((s) => rectCorners(walls).some(([px, pz]) => polylineDistance(px, pz, s.line) < s.halfWidth) || polylineDistance(walls.x, walls.z, s.line) < s.halfWidth + Math.min(walls.halfW, walls.halfD)))
        return "street";
      // The walls, not the eaves (which may overhang a retaining wall), keep off a riser.
      if (crossesRiser(plateau, rectCorners(walls), RETAINING_WALL_DEPTH * k)) return "riser";
      const { bottom, top } = wallGround(ground, walls);
      if (bottom <= dry) return "wet";
      // Off the port's own cell, never on the beach: the spill keeps the shore band clear.
      const shore = onTown(foot.x, foot.z, reach, bottom);
      if (shore) return shore;
      const y = villageStance(bottom, top, scale);
      return y === undefined ? "uneven" : { y };
    };

    const tryPlace: TryPlace = (variant, x, z, yaw, scale, tint, role, attachedTo) => {
      const plan = VILLAGE_PLAN[variant];
      const eave = VILLAGE_EAVE[variant];
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const foot: PlanRect = { x, z, fx, fz, halfW: (plan.halfW + eave) * scale, halfD: (plan.halfD + eave) * scale };
      const walls: PlanRect = { x, z, fx, fz, halfW: plan.halfW * scale, halfD: plan.halfD * scale };
      tried++;
      const verdict = refuse(foot, walls, scale, attachedTo);
      if (typeof verdict === "string") {
        dropped[verdict]++;
        return undefined;
      }
      placed.push(foot);
      const building: VillageBuilding = { kind: variant === "warehouse" ? "warehouse" : "house", variant, worldX: x, worldY: verdict.y, worldZ: z, yaw, scale, tint, roofTone: next() };
      if (role === "waterfront") building.waterfront = true;
      here.push(building);
      meta.push({ foot, role, house: attachedTo });
      return foot;
    };
    const scaleRoll = () => lerpRange(PORT_BUILDING_SCALE_RANGE, next()) * k;
    const tintRoll = () => 1 + (next() * 2 - 1) * PORT_BUILDING_TINT_SPREAD;
    const jitter = () => (next() * 2 - 1) * YAW_JITTER;

    // 1. The waterfront row, either side of the pier root, facing the water: merchants' houses, a warehouse where one will not fit.
    const waterfrontTarget = Math.round(lerpRange(targetOf(WATERFRONT_SHARE), next()));
    let waterfront = 0;
    const plotWidth = Math.max(VILLAGE_PLAN.merchant.halfW + VILLAGE_EAVE.merchant, VILLAGE_PLAN.warehouse.halfW + VILLAGE_EAVE.warehouse) * 2 * k;
    for (let slot = 0; slot < 12 && waterfront < waterfrontTarget; slot++) {
      const side = slot % 2 === 0 ? 1 : -1;
      const along = side * (PIER_WIDTH * pier.scale + plotWidth * (0.6 + Math.floor(slot / 2)) + WATERFRONT_SPACING * k * Math.floor(slot / 2));
      const scale = scaleRoll();
      const tint = tintRoll();
      const yaw = pier.rotation + jitter();
      // Front (the balcony, or the warehouse's doors) to the water, or, where the ground is narrower, the warehouse's long side.
      search: for (let back = 0; back <= WATERFRONT_SETBACK_MAX * k; back += WATERFRONT_SETBACK_STEP * k) {
        const x = pier.worldX + ax * along - dx * back;
        const z = pier.worldZ + az * along - dz * back;
        for (const [variant, turn] of [
          ["merchant", 0],
          ["warehouse", 0],
          ["warehouse", Math.PI / 2],
        ] as const) {
          if (tryPlace(variant, x, z, yaw + turn, scale, tint, "waterfront")) {
            waterfront++;
            break search;
          }
        }
      }
    }

    // 2. The square's ring, the streets' frontages and the edge.
    plateauVillage(plateau, k, tryPlace, next, scaleRoll, tintRoll, jitter);

    // 3. Thinned back to the target, the edge and the streets first, freeing each dropped house's footprint (and its lean-to's).
    const standing = () => here.reduce((n, b) => n + (b.variant === "leanTo" ? 0 : 1), 0);
    if (standing() > VILLAGE_HOUSES) {
      const thin = stream(subSeed(worldSeed, SEED_FEATURES.villageThinning, portId));
      const order = here
        .map((_, i) => ({ i, role: meta[i].role, roll: thin() }))
        .filter((c) => c.role !== "leanTo")
        .sort((a, b) => THIN_ORDER.indexOf(a.role) - THIN_ORDER.indexOf(b.role) || a.roll - b.roll);
      const gone = new Set<number>();
      let count = standing();
      for (const { i } of order) {
        if (count <= VILLAGE_HOUSES) break;
        gone.add(i);
        count--;
        meta.forEach((m, j) => {
          if (m.house === meta[i].foot) gone.add(j);
        });
      }
      const freed = new Set([...gone].map((i) => meta[i].foot));
      for (let j = placed.length - 1; j >= 0; j--) if (freed.has(placed[j])) placed.splice(j, 1);
      dropped.thinned += gone.size;
      const kept = here.filter((_, i) => !gone.has(i));
      here.length = 0;
      here.push(...kept);
    }
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
    ports.push({ portId, cx, cz, plateau, pier, quays, footprints: placed, walls, streets, buildings: here, town: cellsOfTown, tried, dropped });
  }
  return { buildings: town, ports };
}
