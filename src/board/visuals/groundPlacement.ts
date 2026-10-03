/**
 * Placing objects on the terrain height field (ADR 0001).
 *
 * Pure, no Three.js: decorations and port markers ask here for the world Y of
 * the ground under them instead of keeping their own per-elevation tables.
 */
import { SEA_LEVEL, type TerrainHeightField } from "./terrainHeightField";

export type GroundField = Pick<TerrainHeightField, "sampleHeight">;

/** Ground lower than this (just above the waterline) can't take a decoration. */
export const MIN_GROUND_HEIGHT = SEA_LEVEL + 0.03;

/** Fractions of the way from the anchor to the requested spot, tried in order. */
const NUDGE_STEPS = [1, 0.75, 0.5, 0.25, 0];

export interface GroundPlacementOptions {
  /** Radius of the object's base; the ground is probed at its centre and rim. */
  footprintRadius: number;
  /** How far to sink the base below the lowest ground under it, so it never floats. */
  sink: number;
  /** Steepest ground (rise over run) the object may stand on. */
  maxSlope: number;
}

export interface GroundSpot {
  x: number;
  y: number;
  z: number;
}

/** Ground heights at the centre and four rim points of a footprint: [centre, +x, −x, +z, −z]. */
function footprintHeights(field: GroundField, x: number, z: number, radius: number): number[] {
  return [
    field.sampleHeight(x, z),
    field.sampleHeight(x + radius, z),
    field.sampleHeight(x - radius, z),
    field.sampleHeight(x, z + radius),
    field.sampleHeight(x, z - radius),
  ];
}

/**
 * Where an object asked for at `spot` actually stands. If the ground there is
 * too low (at or under the sea) or too steep, the spot is nudged back towards
 * `anchor` (its cell centre); if no point on the way works it is dropped (null).
 * The returned Y is the lowest ground under the footprint minus `sink`, so on a
 * slope the base is buried on the high side rather than floating on the low one.
 */
export function placeOnGround(
  field: GroundField,
  spot: { x: number; z: number },
  anchor: { x: number; z: number },
  options: GroundPlacementOptions
): GroundSpot | null {
  const { footprintRadius: radius, sink, maxSlope } = options;
  for (const t of NUDGE_STEPS) {
    const x = anchor.x + (spot.x - anchor.x) * t;
    const z = anchor.z + (spot.z - anchor.z) * t;
    const heights = footprintHeights(field, x, z, radius);
    const lowest = Math.min(...heights);
    if (lowest < MIN_GROUND_HEIGHT) continue;
    const slope = Math.hypot(heights[1] - heights[2], heights[3] - heights[4]) / (2 * radius);
    if (slope > maxSlope) continue;
    return { x, y: lowest - sink, z };
  }
  return null;
}

/**
 * The highest ground under a footprint, never below sea level: the Y to stand
 * a marker on so no part of its base is buried.
 */
export function groundTopY(field: GroundField, x: number, z: number, footprintRadius: number): number {
  return Math.max(SEA_LEVEL, ...footprintHeights(field, x, z, footprintRadius));
}
