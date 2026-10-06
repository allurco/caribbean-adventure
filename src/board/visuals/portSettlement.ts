/**
 * Where each port's buildings stand (issue #49). Pure, no Three.js.
 * (`PortBuildings.tsx` draws them; this file is named differently because
 * a case-insensitive filesystem cannot tell the two apart.)
 *
 * The generator gives a port cell a `pier` (rotated towards the docking hex)
 * and a `fort` (which the layout used to drop). From those and the port flag
 * this derives a small settlement: a watchtower on the fort's side and up to
 * three other buildings, behind the pier on the landward half of the hex,
 * facing the water. They keep clear of the `PortMarker` hover cylinder at
 * the hex centre, so hovering and the label work as before.
 *
 * A port hex is a small beach with water on one to three sides and a shore
 * ramp running down to each, so each building looks round the landward arc
 * for the flat ground nearest its preferred slot: `placeOnGround` rejects
 * wet or steep spots and keeps the building outside the clearance circle,
 * then the footprint is probed and a spot is only taken if the ground under
 * it spans little enough that, with the origin half a footing above the
 * lowest point, the high side is buried no deeper than BUILDING_MAX_BURY.
 * Kind order, scale, tint and yaw jitter come from a hash of the
 * cell and the whole terrain seed, so every client draws the same port.
 * Each port is placed once from its canonical cell; the world copies redraw
 * the same instances.
 */
import { hexToWorld } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { PORT_MARKER_RADIUS } from "../useHexGrid";
import {
  BUILDING_FOOTING,
  BUILDING_HALF_DIAGONAL,
  BUILDING_HEIGHT,
  BUILDING_MAX_BURY,
  BUILDING_MAX_HEIGHT,
  type BuildingKind,
} from "./buildingGeometry";
import { placeOnGround, type GroundField, type GroundPlacementOptions } from "./groundPlacement";
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
}

/** Gap between the marker's hover cylinder and the nearest building corner. */
export const PORT_BUILDING_CLEARANCE = 0.04;
/** Preferred slots on the landward arc, as turns from straight away from the water (radians). */
export const PORT_BUILDING_SLOT_ANGLES: readonly number[] = [-1.3, -0.45, 0.45, 1.3];
/** How far past the clearance circle a building asks to stand; the ground fit may pull it back to the circle. */
export const PORT_BUILDING_SETBACK = 0.06;
export const PORT_BUILDING_SCALE_RANGE: readonly [number, number] = [0.92, 1.08];
/** The tower's range keeps BUILDING_HEIGHT.watchtower × scale under BUILDING_MAX_HEIGHT. */
export const WATCHTOWER_SCALE_RANGE: readonly [number, number] = [0.95, BUILDING_MAX_HEIGHT / BUILDING_HEIGHT.watchtower];
export const PORT_BUILDING_TINT_SPREAD = 0.08;
/** Buildings face the water give or take this (radians, about 8°). */
export const PORT_BUILDING_YAW_JITTER = 0.14;
/** Gap kept between neighbouring buildings' plan circles. */
export const PORT_BUILDING_GAP = 0.02;

const OTHER_KINDS: readonly BuildingKind[] = ["warehouse", "tavern", "house"];
/** Beaches slope at about 0.33 (0.3 over 0.9) plus relief; a building wants flatter ground than a rock. */
const BUILDING_PLACEMENT: Omit<GroundPlacementOptions, "footprintRadius"> = { sink: 0, maxSlope: 0.6 };
/** Candidate directions span the landward half at this step (radians, 12°). */
const CANDIDATE_STEP = Math.PI / 15;
const CANDIDATE_HALF_COUNT = 7;
const FOOTPRINT_PROBES = 8;
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

/** Lowest and highest ground at the centre and round the rim of a plan circle. */
function footprintGround(field: GroundField, x: number, z: number, reach: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  const probe = (px: number, pz: number) => {
    const h = field.sampleHeight(px, pz);
    min = Math.min(min, h);
    max = Math.max(max, h);
  };
  probe(x, z);
  for (let k = 0; k < FOOTPRINT_PROBES; k++) {
    const a = (k / FOOTPRINT_PROBES) * Math.PI * 2;
    probe(x + Math.cos(a) * reach, z + Math.sin(a) * reach);
  }
  return { min, max };
}

/**
 * The ground contact for a footprint spanning [min, max]: half a footing
 * above the lowest point, so the walls reach under the low side; the high
 * side is then buried by the rest of the spread.
 */
export const buildingGroundY = (min: number) => min + BUILDING_FOOTING / 2;
/** Widest height spread a footprint may take before the high side is buried past BUILDING_MAX_BURY. */
export const BUILDING_MAX_SPREAD = BUILDING_FOOTING / 2 + BUILDING_MAX_BURY;

interface Footprint {
  x: number;
  z: number;
  reach: number;
}

/**
 * Ground for a building of plan radius `reach`, as near as the land allows
 * to the ray at `preferred` from the hex centre, no closer to the centre
 * than the marker clearance and not overlapping a building already placed.
 */
function standOnBeach(
  field: GroundField,
  centre: { x: number; z: number },
  landward: number,
  preferred: number,
  reach: number,
  placed: readonly Footprint[]
): { x: number; y: number; z: number } | null {
  const inner = PORT_MARKER_RADIUS + PORT_BUILDING_CLEARANCE + reach;
  const candidates: number[] = [];
  for (let k = -CANDIDATE_HALF_COUNT; k <= CANDIDATE_HALF_COUNT; k++) candidates.push(landward + k * CANDIDATE_STEP);
  candidates.sort((a, b) => angleDiff(a, preferred) - angleDiff(b, preferred) || a - b);

  for (const angle of candidates) {
    const dir = { x: Math.sin(angle), z: Math.cos(angle) };
    const anchor = { x: centre.x + dir.x * inner, z: centre.z + dir.z * inner };
    const spot = { x: centre.x + dir.x * (inner + PORT_BUILDING_SETBACK), z: centre.z + dir.z * (inner + PORT_BUILDING_SETBACK) };
    const ground = placeOnGround(field, spot, anchor, { ...BUILDING_PLACEMENT, footprintRadius: reach });
    if (!ground) continue;
    if (placed.some((p) => Math.hypot(p.x - ground.x, p.z - ground.z) < p.reach + reach + PORT_BUILDING_GAP)) continue;
    const { min, max } = footprintGround(field, ground.x, ground.z, reach);
    if (max - min > BUILDING_MAX_SPREAD) continue;
    return { x: ground.x, y: buildingGroundY(min), z: ground.z };
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
    // The seed goes in through the salt: seedOf quantises its values by 4096 (a
    // 12-bit shift into int32), which would drop a 32-bit seed's top 12 bits.
    const next = stream(seedOf([cell.hex.q, cell.hex.r], PORT_BUILDING_SALT ^ seed));

    // The watchtower takes the slot nearest the fort decoration's side of the
    // hex and is placed first, so it gets the pick of the ground.
    const slots = PORT_BUILDING_SLOT_ANGLES.map((a) => landward + a);
    const order: { kind: BuildingKind; slot: number }[] = [];
    if (fort) {
      const fortDirection = Math.atan2(fort.position[0], fort.position[2]);
      const towerSlot = slots.reduce(
        (best, angle, i) => (angleDiff(angle, fortDirection) < angleDiff(slots[best], fortDirection) ? i : best),
        0
      );
      order.push({ kind: "watchtower", slot: slots[towerSlot] });
      slots.splice(towerSlot, 1);
    }
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
      const reach = BUILDING_HALF_DIAGONAL[kind] * scale;
      const ground = standOnBeach(field, centre, landward, slot, reach, placed);
      if (!ground) continue;
      placed.push({ x: ground.x, z: ground.z, reach });
      buildings.push({ kind, worldX: ground.x, worldY: ground.y, worldZ: ground.z, yaw, scale, tint });
    }
  }
  return buildings;
}
