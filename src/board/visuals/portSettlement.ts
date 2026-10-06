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
 * `placeOnGround` rejects wet or steep spots, then the footprint is probed
 * and a spot is only taken if the ground under it spans no more than the
 * building's footing covers (`buildingMaxSpread`). The building then stands
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
 */
import { hexToWorld } from "../../game/hex";
import type { MapCell, PortNation } from "../../game/types";
import { PIER_WIDTH } from "./pierGeometry";
import { pierOrigin } from "./pierPlacement";
import { BUILDING_FOOTING, BUILDING_MAX_HEIGHT, type BuildingKind } from "./buildingGeometry";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_HEIGHT } from "./agedBuildingGeometry";
import { placeOnGround, type GroundField, type GroundPlacementOptions } from "./groundPlacement";
import { SEA_LEVEL } from "./terrainHeightField";
import { placeQuay, quayTopAt, type QuayPlacement } from "./quayPlacement";
import { lerpRange, seedOf, stream } from "./variationStream";

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

/** Preferred slots on the landward arc, as turns from straight away from the water (radians). */
export const PORT_BUILDING_SLOT_ANGLES: readonly number[] = [-1.3, -0.45, 0.45, 1.3];
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
/** The largest plan reach any kind can have, at its largest scale. */
const maxPlanReach = Math.max(
  ...Object.entries(AGED_BUILDING_HALF_DIAGONAL).map(
    ([kind, reach]) => reach * (kind === "watchtower" ? WATCHTOWER_SCALE_RANGE : PORT_BUILDING_SCALE_RANGE)[1]
  )
);
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

/**
 * Lowest and highest ground over a plan circle, and the footprint's stance to
 * the quay. Probed at the centre, the rim and two inner rings, and at every
 * crease of the ground inside the circle (the lattice vertices of the drawn
 * surface), where a piecewise-flat surface takes its extremes.
 */
function footprintGround(ground: SettlementGround, x: number, z: number, reach: number): { min: number; max: number; quay: QuayStance } {
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
/** The ground contact for a footprint whose highest ground is `max`. */
export const buildingGroundY = (max: number) => max - BUILDING_SINK;
/** Widest height spread a footprint may take: its footing (BUILDING_FOOTING at the building's scale) covers the low side with the margin to spare. */
export const buildingMaxSpread = (footing: number) => footing - BUILDING_SINK - BUILDING_FOOTING_MARGIN;

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
 * ground spanning no more than `buildingMaxSpread(footing)`. Its Y is
 * `buildingGroundY` of the highest ground under it: on the ground, never
 * cut into it, the footing covering the low side.
 */
export function standBuilding(
  ground: SettlementGround,
  at: { x: number; z: number },
  reach: number,
  footing: number,
  pierRoot: { x: number; z: number },
  placed: readonly Footprint[]
): { x: number; y: number; z: number } | null {
  if (placed.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < p.reach + reach + PORT_BUILDING_GAP)) return null;
  const { min, max, quay } = footprintGround(ground, at.x, at.z, reach);
  if (quay === "edge") return null;
  if (Math.hypot(pierRoot.x - at.x, pierRoot.z - at.z) < pierRootReserve(quay === "on") + reach) return null;
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
  placed: readonly Footprint[]
): { x: number; y: number; z: number } | null {
  for (const angle of candidates) {
    const dir = { x: Math.sin(angle), z: Math.cos(angle) };
    // Rings from the square outwards, the first with the near corner on the square's edge;
    // the ground fit may pull a spot back to the ring inside it.
    const first = PORT_SQUARE_RADIUS + reach;
    for (let radius = first; radius <= PORT_BUILDING_MAX_RADIUS + 1e-9; radius += RADIAL_STEP) {
      const inner = Math.max(first, radius - RADIAL_STEP);
      const anchor = { x: centre.x + dir.x * inner, z: centre.z + dir.z * inner };
      const spot = { x: centre.x + dir.x * radius, z: centre.z + dir.z * radius };
      const dry = placeOnGround(ground, spot, anchor, { ...BUILDING_PLACEMENT, footprintRadius: reach });
      if (!dry) continue;
      const stood = standBuilding(ground, dry, reach, footing, pierRoot, placed);
      if (stood) return stood;
    }
  }
  return null;
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
    const centre = { x: hexX, z: hexZ };
    const ground = settlementGround(cell, field, seed);
    const pierRoot = pierOrigin(field, centre, toWater);
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
    const order: { kind: BuildingKind; slot: number }[] = [{ kind: "watchtower", slot: slots[towerSlot] }];
    slots.splice(towerSlot, 1);
    for (const kind of shuffledKinds(next)) {
      const slot = slots.shift();
      if (slot === undefined) break;
      order.push({ kind, slot });
    }

    const placed: Footprint[] = [];
    for (const { kind, slot } of order) {
      const scale = lerpRange(kind === "watchtower" ? WATCHTOWER_SCALE_RANGE : PORT_BUILDING_SCALE_RANGE, next());
      const tint = 1 + (next() * 2 - 1) * PORT_BUILDING_TINT_SPREAD;
      const yaw = toWater + (next() * 2 - 1) * PORT_BUILDING_YAW_JITTER;
      const reach = AGED_BUILDING_HALF_DIAGONAL[kind] * scale;
      const footing = BUILDING_FOOTING * scale;
      let spot = standOnBeach(ground, centre, candidateAngles(landward, slot, false), reach, footing, pierRoot, placed);
      if (!spot && kind === "watchtower") {
        // The landmark is never dropped: any direction, then the hex centre on its highest ground (never under the sea).
        spot =
          standOnBeach(ground, centre, candidateAngles(landward, slot, true), reach, footing, pierRoot, placed) ??
          { x: centre.x, y: buildingGroundY(Math.max(SEA_LEVEL, footprintGround(ground, centre.x, centre.z, reach).max)), z: centre.z };
      }
      if (!spot) continue;
      placed.push({ x: spot.x, z: spot.z, reach });
      const building: PortBuilding = { kind, worldX: spot.x, worldY: spot.y, worldZ: spot.z, yaw, scale, tint };
      if (kind === "watchtower" && cell.nation) building.nation = cell.nation;
      buildings.push(building);
    }
  }
  return buildings;
}
