/**
 * Where each port's buildings stand (issue #49). Pure, no Three.js.
 * (`PortBuildings.tsx` draws them; this file is named differently because
 * a case-insensitive filesystem cannot tell the two apart.)
 *
 * The generator gives a port cell a `pier` (rotated towards the docking hex)
 * and a `fort` (which the layout used to drop). From those and the port flag
 * this derives a small settlement: the watchtower, the port's landmark
 * (#59), and up to three other buildings, behind the pier on the landward
 * half of the hex, facing the water. The `PortMarker` at the hex centre is
 * an invisible hover volume (#59), so the buildings may use the whole hex:
 * they form a crescent round a small open square at the centre, each as
 * near the square as the ground and its neighbours allow, keeping clear too
 * of the pier's land end (`pierOrigin`), where the stone quay stands
 * (`quayPlacement.ts`). The tower takes the end of the crescent on the fort's side,
 * the slot nearest the water, so it reads against the sea; it flies the
 * port's nation and every port gets one, with or without a fort: if no spot
 * on the landward arc takes it, any direction will do, and failing that it
 * stands at the hex centre.
 *
 * A port hex is a small beach with water on one to three sides and a shore
 * ramp running down to each, so each building looks round the landward arc
 * for the flat ground nearest its preferred slot, from the centre outwards:
 * `placeOnGround` rejects wet or steep spots over the plan circle, then the
 * ground under the walls is probed (the walls' plan rectangle turned to the
 * building's yaw with `PLAN_FOOTPRINT_MARGIN` round it, not the circle,
 * which circumscribes the eaves and the lean and spans up to twice the
 * walls' width) and a spot is only taken if the ground there spans no more
 * than the building's footing covers (`buildingMaxSpread`). The building then stands
 * ON the ground: its ground contact a hair (`BUILDING_SINK`) under the
 * highest point under the footprint, so no wall is cut into by rising
 * sand, and its stone footing reaching down past the lowest point with
 * `BUILDING_FOOTING_MARGIN` to spare, so nothing floats; on a slope the
 * footing shows on the downhill side as a plinth.
 *
 * The ground the buildings probe is `settlementGround`: the ground as it is
 * drawn (the layout passes the land mesh's lattice surface, `landSurface`,
 * which differs from the smooth field by up to a few hundredths between
 * lattice points), with the quay's flat top wherever a point is on the
 * quay, so a building on the quay stands on its deck and not on the sand
 * under it. A footprint is
 * either wholly on the quay or wholly off it (one straddling the edge would
 * step a wall down the quay's side), and the reserve round the pier's land
 * end shrinks on the quay from the deck's width to the pier's mouth, so the
 * deck is buildable but the pier's land end stays walkable.
 * Kind order, scale, tint and yaw jitter come from a hash of the
 * cell and the whole terrain seed, so every client draws the same port.
 * Each port is placed once from its canonical cell; the world copies redraw
 * the same instances.
 *
 * At the 350 m hex (ADR 0003, `worldScale.ts`) every building is drawn at
 * `BUILDING_SCALE`, and so are the square, the rings, the gap between
 * buildings, the sink and the footing margin; the reserve round the pier's
 * land end follows the pier (`PROP_SCALE`). The whole layout centres on
 * `settlementCentre`, by the quay, rather than on the hex centre.
 */
import { hexToWorld } from "../../game/hex";
import type { MapCell, PortNation } from "../../game/types";
import { PIER_WIDTH } from "./pierGeometry";
import { pierOrigin } from "./pierPlacement";
import { BUILDING_FOOTING, BUILDING_KINDS, BUILDING_MAX_HEIGHT, type BuildingKind } from "./buildingGeometry";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_HEIGHT, AGED_BUILDING_PLAN } from "./agedBuildingGeometry";
import { placeOnGround, type GroundField, type GroundPlacementOptions } from "./groundPlacement";
import { SEA_LEVEL } from "./terrainHeightField";
import { placeQuay, quayTopAt, type QuayPlacement } from "./quayPlacement";
import { lerpRange, seedOf, stream } from "./variationStream";
import { BUILDING_SCALE, PROP_SCALE } from "./worldScale";

export interface PortBuilding {
  kind: BuildingKind;
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Turn about the vertical axis (radians); the front faces +z before the turn. */
  yaw: number;
  /** Uniform scale. */
  scale: number;
  /** Multiplier on the vertex colours, within 1 ± PORT_BUILDING_TINT_SPREAD. */
  tint: number;
  /** The watchtower flies this nation's flag (the port cell's nation); unset on the other kinds. */
  nation?: PortNation;
}

/**
 * Preferred slots on the landward arc, as turns from straight away from
 * the water (radians). The middle slot, straight landward, is the church's:
 * it fronts the square (#59). The slots either side of it were at ±0.45
 * for four small buildings; with the church's 0.23 footprint between them
 * they stand at ±0.8, or a house beside the church would be pushed to the
 * outer ring before it cleared it.
 */
export const PORT_BUILDING_SLOT_ANGLES: readonly number[] = [-1.3, -0.8, 0, 0.8, 1.3];
/** The slot the church takes, straight landward of the square. */
export const PORT_CHURCH_SLOT_INDEX = 2;
/** The open square at the hex centre that no building corner enters: the crescent forms round it. */
export const PORT_SQUARE_RADIUS = 0.15;
/** Farthest a building's origin stands from the hex centre: the widest building then still lies inside the hex. */
export const PORT_BUILDING_MAX_RADIUS = 0.62;
/** Kept clear round the pier's land end (`pierOrigin`) by a footprint on the sand: the deck's width, so nothing crowds the quay from the beach. */
export const PIER_ROOT_RESERVE = PIER_WIDTH;
/** Kept clear round the pier's land end by a footprint on the quay: the pier's mouth, half its width, so the deck is buildable but the pier stays walkable. */
export const PIER_MOUTH_RESERVE = PIER_WIDTH / 2;
/** The reserve a footprint's edge keeps from the pier root, by whether the footprint stands on the quay. */
export const pierRootReserve = (onQuay: boolean) => (onQuay ? PIER_MOUTH_RESERVE : PIER_ROOT_RESERVE);
/** Rings tried from the centre outwards, this far apart; `placeOnGround` nudges within a ring's step. */
const RADIAL_STEP = 0.04;
export const PORT_BUILDING_SCALE_RANGE: readonly [number, number] = [0.92, 1.08];
/** The tower's range keeps AGED_BUILDING_HEIGHT.watchtower × scale (the flag's hoist) under BUILDING_MAX_HEIGHT. */
export const WATCHTOWER_SCALE_RANGE: readonly [number, number] = [0.95, BUILDING_MAX_HEIGHT / AGED_BUILDING_HEIGHT.watchtower];
/**
 * The church's range is narrower than the houses': its cross at the top of
 * the range stays under the cap and clearly under the smallest tower's pole
 * top, so the tower remains the port's one tallest landmark (pinned in
 * `portSettlement.test.ts`).
 */
export const CHURCH_SCALE_RANGE: readonly [number, number] = [0.96, 1.04];
/** The scale range a kind is drawn at. */
export const scaleRangeOf = (kind: BuildingKind): readonly [number, number] =>
  kind === "watchtower" ? WATCHTOWER_SCALE_RANGE : kind === "church" ? CHURCH_SCALE_RANGE : PORT_BUILDING_SCALE_RANGE;
/** The largest plan reach any kind can have, at its largest scale. */
const maxPlanReach = Math.max(...BUILDING_KINDS.map((kind) => AGED_BUILDING_HALF_DIAGONAL[kind] * scaleRangeOf(kind)[1]));
/**
 * The settlement's envelope: no building's corner stands farther than this
 * from the hex centre (the farthest origin plus the widest plan reach), and
 * it stays inside the hex's inradius. The port's hover volume covers it.
 */
export const PORT_SETTLEMENT_RADIUS = PORT_BUILDING_MAX_RADIUS + maxPlanReach;
export const PORT_BUILDING_TINT_SPREAD = 0.08;
/** Buildings face the water give or take this (radians, about 8°). */
export const PORT_BUILDING_YAW_JITTER = 0.14;
/** Gap kept between neighbouring buildings' plan circles: a lane, now the cluster closes in on the centre. */
export const PORT_BUILDING_GAP = 0.06;

const OTHER_KINDS: readonly BuildingKind[] = ["warehouse", "tavern", "house"];
/** Beaches slope at about 0.33 (0.3 over 0.9) plus relief; a building wants flatter ground than a rock. */
const BUILDING_PLACEMENT: Omit<GroundPlacementOptions, "footprintRadius"> = { sink: 0, maxSlope: 0.6 };
/** Candidate directions span the landward half at this step (radians, 7.5°), ±82.5° of straight inland. */
const CANDIDATE_STEP = Math.PI / 24;
const CANDIDATE_HALF_COUNT = 11;
/** Probes round a footprint's rim; half as many at half reach and a quarter at a quarter, plus the centre. */
const FOOTPRINT_PROBES = 24;
const PORT_BUILDING_SALT = 0x3b9d2c57;

const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** A seeded permutation of the other kinds (Fisher–Yates). */
function shuffledKinds(next: () => number): BuildingKind[] {
  const kinds = [...OTHER_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(next() * (i + 1)));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds;
}

/** Where a footprint stands with respect to the quay: wholly on it, wholly off it, or across its edge. */
type QuayStance = "on" | "off" | "edge";

/** The walls' plan in the world: half-extents across (x) and along (z) before the turn, and the turn about y. */
export interface PlanFootprint {
  halfW: number;
  halfD: number;
  yaw: number;
}

/**
 * How far past the wall line the ground is probed, at scale 1: over the
 * plinth course (0.004 proud), the lean's shift of the walls at the eaves
 * (under 0.01) and some of the eave's overhang (0.025). Beyond, the ground
 * is beside the building, not under it, and may rise above the contact as
 * it does round any building on a slope. A kind whose plan corner with
 * this margin would stand outside its plan circle takes a smaller one
 * (`planMargin`).
 */
export const PLAN_FOOTPRINT_MARGIN = 0.02;
/** Probes across and along a plan rectangle, edges included. */
const PLAN_PROBES = { across: 9, along: 13 };

/**
 * The margin round a kind's walls, at scale 1: `PLAN_FOOTPRINT_MARGIN`,
 * or less where that would put the rectangle's corners outside the plan
 * circle (`AGED_BUILDING_HALF_DIAGONAL`). The rectangle must stay inside
 * the circle: the creases probed under it are the ones within the circle,
 * and the circle is what keeps neighbours and the pier root clear and
 * drives the wet/steep check, so ground outside it is not the building's
 * to stand on or be rejected for. The tower's square plan (0.1 half-base)
 * under its 0.15 reach would reach 0.17 at the corner with the full
 * margin; it takes the largest margin whose corner lies on the circle,
 * about 0.006, still past its plinth course.
 */
export function planMargin(kind: BuildingKind): number {
  const { halfW, halfD } = AGED_BUILDING_PLAN[kind];
  const reach = AGED_BUILDING_HALF_DIAGONAL[kind];
  // The largest m with (halfW + m)² + (halfD + m)² = reach²: 2m² + 2(halfW + halfD)m + (halfW² + halfD² − reach²) = 0.
  const b = halfW + halfD;
  const c = halfW * halfW + halfD * halfD - reach * reach;
  const onCircle = (-b + Math.sqrt(b * b - 2 * c)) / 2;
  return Math.max(0, Math.min(PLAN_FOOTPRINT_MARGIN, onCircle));
}

/** The walls' plan footprint of a kind at a scale and yaw, with the margin round it. */
export function planFootprint(kind: BuildingKind, scale: number, yaw: number): PlanFootprint {
  const plan = AGED_BUILDING_PLAN[kind];
  const margin = planMargin(kind);
  return { halfW: (plan.halfW + margin) * scale, halfD: (plan.halfD + margin) * scale, yaw };
}

/** A point of a plan rectangle, from local (across, along) to the world. */
const planPoint = (x: number, z: number, plan: PlanFootprint, lx: number, lz: number) => {
  const c = Math.cos(plan.yaw);
  const s = Math.sin(plan.yaw);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
};

/** Whether a world point lies within a plan rectangle. */
const inPlan = (x: number, z: number, plan: PlanFootprint, px: number, pz: number) => {
  const c = Math.cos(plan.yaw);
  const s = Math.sin(plan.yaw);
  const dx = px - x;
  const dz = pz - z;
  return Math.abs(dx * c - dz * s) <= plan.halfW && Math.abs(dx * s + dz * c) <= plan.halfD;
};

/** A grid of `across` × `along` points over a plan rectangle, its edges and corners included. */
export function planProbePoints(x: number, z: number, plan: PlanFootprint, across = PLAN_PROBES.across, along = PLAN_PROBES.along): { x: number; z: number }[] {
  const points: { x: number; z: number }[] = [];
  for (let i = 0; i < across; i++) {
    for (let j = 0; j < along; j++) {
      points.push(planPoint(x, z, plan, (i / (across - 1) - 0.5) * 2 * plan.halfW, (j / (along - 1) - 0.5) * 2 * plan.halfD));
    }
  }
  return points;
}

/**
 * Lowest and highest ground under a footprint, and its stance to the quay.
 * With a `plan`, the footprint is the walls' rectangle: probed on a grid
 * over it and at every crease of the ground inside it (the lattice vertices
 * of the drawn surface), where a piecewise-flat surface takes its extremes.
 * Without one, it is the plan circle of radius `reach`: the centre, the rim
 * and two inner rings, and the creases inside the circle.
 */
function footprintGround(ground: SettlementGround, x: number, z: number, reach: number, plan?: PlanFootprint): { min: number; max: number; quay: QuayStance } {
  let min = Infinity;
  let max = -Infinity;
  let onQuay = 0;
  let probes = 0;
  const probe = (px: number, pz: number) => {
    const h = ground.sampleHeight(px, pz);
    min = Math.min(min, h);
    max = Math.max(max, h);
    if (ground.onQuay(px, pz)) onQuay++;
    probes++;
  };
  if (plan) {
    for (const p of planProbePoints(x, z, plan)) probe(p.x, p.z);
    for (const p of ground.creasesWithin?.(x, z, reach) ?? []) if (inPlan(x, z, plan, p.x, p.z)) probe(p.x, p.z);
  } else {
    probe(x, z);
    for (const [count, r] of [
      [FOOTPRINT_PROBES, reach],
      [FOOTPRINT_PROBES / 2, reach / 2],
      [FOOTPRINT_PROBES / 4, reach / 4],
    ]) {
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2;
        probe(x + Math.cos(a) * r, z + Math.sin(a) * r);
      }
    }
    for (const p of ground.creasesWithin?.(x, z, reach) ?? []) probe(p.x, p.z);
  }
  const quay: QuayStance = onQuay === 0 ? "off" : onQuay === probes ? "on" : "edge";
  return { min, max, quay };
}

/**
 * The ground contact sits this far below the highest ground under the
 * footprint: the high side meets the wall rather than a sliver of air, and
 * is never cut into by more.
 */
export const BUILDING_SINK = 0.002;
/** The footing's base stays at least this far under the lowest ground under the footprint, so nothing floats. */
export const BUILDING_FOOTING_MARGIN = 0.01;
/** The ground contact for a footprint whose highest ground is `max` (the sink at `BUILDING_SCALE`). */
export const buildingGroundY = (max: number) => max - BUILDING_SINK * BUILDING_SCALE;
/** Widest height spread a footprint may take: its footing (BUILDING_FOOTING at the building's scale) covers the low side with the margin to spare. */
export const buildingMaxSpread = (footing: number) => footing - (BUILDING_SINK + BUILDING_FOOTING_MARGIN) * BUILDING_SCALE;

/** A building already placed: its plan circle. */
export interface Footprint {
  x: number;
  z: number;
  reach: number;
}

/** The ground a port's buildings stand on: the terrain with the quay's deck laid over it. */
export interface SettlementGround extends GroundField {
  /** The port's quay, placed once, or null where the cell has none. */
  quay: QuayPlacement | null;
  /** Whether a world point lies on the quay (its deck or rear step). */
  onQuay(x: number, z: number): boolean;
}

/**
 * The ground a port's buildings stand on: the terrain height field, with
 * the quay's flat top wherever (x, z) is on the quay, so the footprint
 * probes and `placeOnGround` see a building on the quay standing on its
 * deck. Where the sand drifts over the quay's back (the quay is lowered
 * onto low ground, never raised over high) the sand is the visible
 * surface and wins. The quay is placed once here, however many points a
 * port's buildings then probe. Same `field` and `seed` as `portQuays`.
 */
export function settlementGround(cell: MapCell, field: GroundField, seed: number): SettlementGround {
  const quay = placeQuay(cell, field, seed);
  // The ground's creases are the terrain's: the deck is flat, and where the sand drifts over the quay they are the sand's.
  const creasesWithin = field.creasesWithin?.bind(field);
  if (!quay) return { quay, creasesWithin, onQuay: () => false, sampleHeight: (x, z) => field.sampleHeight(x, z) };
  return {
    quay,
    creasesWithin,
    onQuay: (x, z) => quayTopAt(quay, { x, z }) !== undefined,
    sampleHeight: (x, z) => {
      const terrain = field.sampleHeight(x, z);
      const top = quayTopAt(quay, { x, z });
      return top === undefined ? terrain : Math.max(top, terrain);
    },
  };
}

/**
 * A building of plan radius `reach` whose walls reach `footing` below its
 * ground contact, standing at `at`, if the ground there takes it: clear of
 * the pier's land end (by the sand's reserve or, on the quay, the pier's
 * mouth), off its neighbours, wholly on or wholly off the quay, and on
 * ground spanning no more than `buildingMaxSpread(footing)`. The ground
 * under it is the walls' `plan` rectangle when given, else the plan circle.
 * Its Y is `buildingGroundY` of the highest ground under it: on the ground,
 * never cut into it, the footing covering the low side.
 */
export function standBuilding(
  ground: SettlementGround,
  at: { x: number; z: number },
  reach: number,
  footing: number,
  pierRoot: { x: number; z: number },
  placed: readonly Footprint[],
  plan?: PlanFootprint
): { x: number; y: number; z: number } | null {
  if (placed.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < p.reach + reach + PORT_BUILDING_GAP * BUILDING_SCALE)) return null;
  const { min, max, quay } = footprintGround(ground, at.x, at.z, reach, plan);
  if (quay === "edge") return null;
  // The reserve is the pier's width, so it shrinks with the pier.
  if (Math.hypot(pierRoot.x - at.x, pierRoot.z - at.z) < pierRootReserve(quay === "on") * PROP_SCALE + reach) return null;
  if (max - min > buildingMaxSpread(footing)) return null;
  return { x: at.x, y: buildingGroundY(max), z: at.z };
}

/** Candidate directions: the landward arc at CANDIDATE_STEP, or the whole circle, nearest `preferred` first. */
function candidateAngles(landward: number, preferred: number, wholeCircle: boolean): number[] {
  const candidates: number[] = [];
  const half = wholeCircle ? Math.round(Math.PI / CANDIDATE_STEP) : CANDIDATE_HALF_COUNT;
  for (let k = -half; k < (wholeCircle ? half : half + 1); k++) candidates.push(landward + k * CANDIDATE_STEP);
  return candidates.sort((a, b) => angleDiff(a, preferred) - angleDiff(b, preferred) || a - b);
}

/**
 * Ground for a building of plan radius `reach`, as near as the land allows
 * to the ray at `preferred` from the hex centre and as near the square as
 * the ground, the pier's land end and the buildings already placed allow.
 */
function standOnBeach(
  ground: SettlementGround,
  centre: { x: number; z: number },
  candidates: readonly number[],
  reach: number,
  footing: number,
  pierRoot: { x: number; z: number },
  placed: readonly Footprint[],
  plan: PlanFootprint
): { x: number; y: number; z: number } | null {
  for (const angle of candidates) {
    const dir = { x: Math.sin(angle), z: Math.cos(angle) };
    // Rings from the square outwards, the first with the near corner on the square's edge;
    // the ground fit may pull a spot back to the ring inside it. The square, the rings and their step are at `BUILDING_SCALE`.
    const first = PORT_SQUARE_RADIUS * BUILDING_SCALE + reach;
    const step = RADIAL_STEP * BUILDING_SCALE;
    for (let radius = first; radius <= PORT_BUILDING_MAX_RADIUS * BUILDING_SCALE + 1e-9; radius += step) {
      const inner = Math.max(first, radius - step);
      const anchor = { x: centre.x + dir.x * inner, z: centre.z + dir.z * inner };
      const spot = { x: centre.x + dir.x * radius, z: centre.z + dir.z * radius };
      const dry = placeOnGround(ground, spot, anchor, { ...BUILDING_PLACEMENT, footprintRadius: reach });
      if (!dry) continue;
      const stood = standBuilding(ground, dry, reach, footing, pierRoot, placed, plan);
      if (stood) return stood;
    }
  }
  return null;
}

/**
 * The centre the settlement's square and crescent are laid out round: the
 * hex centre pulled towards the pier's land end to `PROP_SCALE` of its
 * distance, so at the 350 m hex the tower, the church and the rest stand by
 * the quay rather than alone in the middle of the hex.
 */
export function settlementCentre(hexCentre: { x: number; z: number }, pierRoot: { x: number; z: number }): { x: number; z: number } {
  return { x: pierRoot.x + (hexCentre.x - pierRoot.x) * PROP_SCALE, z: pierRoot.z + (hexCentre.z - pierRoot.z) * PROP_SCALE };
}

/** The buildings for every port, on the ground; `seed` is the map's terrain seed. */
export function portBuildings(cells: readonly MapCell[], field: GroundField, seed: number): PortBuilding[] {
  const buildings: PortBuilding[] = [];
  for (const cell of cells) {
    if (!cell.hasPort) continue;
    const decorations = cell.decorations ?? [];
    const pier = decorations.find((d) => d.type === "pier");
    const fort = decorations.find((d) => d.type === "fort");
    const toWater = pier?.rotation ?? 0;
    const landward = toWater + Math.PI;

    const [hexX, , hexZ] = hexToWorld(cell.hex);
    const hexCentre = { x: hexX, z: hexZ };
    const ground = settlementGround(cell, field, seed);
    const pierRoot = pierOrigin(field, hexCentre, toWater);
    const centre = settlementCentre(hexCentre, pierRoot);
    // The seed goes in through the salt: seedOf quantises its values by 4096 (a
    // 12-bit shift into int32), which would drop a 32-bit seed's top 12 bits.
    const next = stream(seedOf([cell.hex.q, cell.hex.r], PORT_BUILDING_SALT ^ seed));

    // The watchtower takes the end of the crescent on the fort decoration's
    // side (either end if there is no fort) and is placed first, so it gets
    // the pick of the ground.
    const slots = PORT_BUILDING_SLOT_ANGLES.map((a) => landward + a);
    const ends = [0, slots.length - 1];
    const fortDirection = fort ? Math.atan2(fort.position[0], fort.position[2]) : null;
    const towerSlot =
      fortDirection === null
        ? ends[next() < 0.5 ? 0 : 1]
        : ends.reduce((best, i) => (angleDiff(slots[i], fortDirection) < angleDiff(slots[best], fortDirection) ? i : best), ends[0]);
    // The church fronts the square from straight landward and is placed second, before the shuffled others.
    const order: { kind: BuildingKind; slot: number }[] = [
      { kind: "watchtower", slot: slots[towerSlot] },
      { kind: "church", slot: slots[PORT_CHURCH_SLOT_INDEX] },
    ];
    slots.splice(towerSlot, 1);
    slots.splice(slots.indexOf(landward + PORT_BUILDING_SLOT_ANGLES[PORT_CHURCH_SLOT_INDEX]), 1);
    for (const kind of shuffledKinds(next)) {
      const slot = slots.shift();
      if (slot === undefined) break;
      order.push({ kind, slot });
    }

    const placed: Footprint[] = [];
    for (const { kind, slot } of order) {
      const scale = lerpRange(scaleRangeOf(kind), next()) * BUILDING_SCALE;
      const tint = 1 + (next() * 2 - 1) * PORT_BUILDING_TINT_SPREAD;
      const yaw = toWater + (next() * 2 - 1) * PORT_BUILDING_YAW_JITTER;
      const reach = AGED_BUILDING_HALF_DIAGONAL[kind] * scale;
      const footing = BUILDING_FOOTING * scale;
      const plan = planFootprint(kind, scale, yaw);
      let spot = standOnBeach(ground, centre, candidateAngles(landward, slot, false), reach, footing, pierRoot, placed, plan);
      // The landmark and the church look round the whole hex if the landward arc has no room; the tower
      // is never dropped and takes the hex centre on its highest ground (never under the sea), the church is dropped.
      if (!spot && (kind === "watchtower" || kind === "church")) spot = standOnBeach(ground, centre, candidateAngles(landward, slot, true), reach, footing, pierRoot, placed, plan);
      // The fallback is the hex centre, not the settlement's: that one may stand on the shore ramp or in the water.
      if (!spot && kind === "watchtower")
        spot = { x: hexCentre.x, y: buildingGroundY(Math.max(SEA_LEVEL, footprintGround(ground, hexCentre.x, hexCentre.z, reach, plan).max)), z: hexCentre.z };
      if (!spot) continue;
      placed.push({ x: spot.x, z: spot.z, reach });
      const building: PortBuilding = { kind, worldX: spot.x, worldY: spot.y, worldZ: spot.z, yaw, scale, tint };
      if (kind === "watchtower" && cell.nation) building.nation = cell.nation;
      buildings.push(building);
    }
  }
  return buildings;
}
