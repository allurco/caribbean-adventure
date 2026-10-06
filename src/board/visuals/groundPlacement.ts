/**
 * Placing objects on the terrain height field (ADR 0001).
 *
 * Pure, no Three.js: decorations and port markers ask here for the world Y of
 * the ground under them instead of keeping their own per-elevation tables.
 */
import { SEA_LEVEL, type TerrainHeightField } from "./terrainHeightField";

export interface GroundField extends Pick<TerrainHeightField, "sampleHeight"> {
  /**
   * Where the ground creases within `radius` of (x, z): the vertices of a
   * drawn lattice surface (`landSurface`) inside the disc, and the points
   * where its edges cross the disc's rim, between which the surface is
   * flat. A footprint's highest and lowest ground lie on these or between
   * rim probes, so a placement that must not be cut into probes them as
   * well. Unset on a smooth field.
   */
  creasesWithin?(x: number, z: number, radius: number): { x: number; z: number }[];
}

/** Ground lower than this (just above the waterline) can't take a decoration. */
export const MIN_GROUND_HEIGHT = SEA_LEVEL + 0.03;

/** Fractions of the way from the anchor to the requested spot, tried in order. */
const NUDGE_STEPS = [1, 0.75, 0.5, 0.25, 0];

/**
 * Rim probes per footprint, evenly spaced round it starting at +x. With a
 * footprint up to a hex's inradius (rocks, #53) 16 keeps neighbouring probes
 * about a third of a unit apart, closer than the coastline's wiggles
 * (`COAST_NOISE_AMPLITUDE` 0.25 at frequency 1.3), so an inlet can't slip
 * between them under a rim.
 */
const RIM_PROBES = 16;
const RIM_ANGLES = Array.from({ length: RIM_PROBES }, (_, k) => (k / RIM_PROBES) * Math.PI * 2);
/** Indices into `footprintHeights` of the +x, −x, +z and −z rim probes (after the centre at 0). */
const PLUS_X = 1;
const MINUS_X = 1 + RIM_PROBES / 2;
const PLUS_Z = 1 + RIM_PROBES / 4;
const MINUS_Z = 1 + (3 * RIM_PROBES) / 4;

/**
 * Which probe an object's base rests on. `lowest` (the default) buries the
 * base on the high side of a slope so nothing floats: right for a trunk.
 * `centre` stands it on the ground at its own centre, so a wide base on a
 * steep summit keeps its top above the ground; the object's own buried
 * underside covers the downhill side (#53, rocks).
 */
export type StandOn = "lowest" | "centre";

export interface GroundPlacementOptions {
  /** Radius of the object's base; the ground is probed at its centre and rim. */
  footprintRadius: number;
  /** How far to sink the base below the ground it stands on, so it never floats. */
  sink: number;
  /** Steepest ground (rise over run) the object may stand on. */
  maxSlope: number;
  /** Which probe the base rests on; `lowest` unless given. */
  standOn?: StandOn;
  /**
   * Deepest the base may sit below the ground at the footprint's centre
   * (the sink included); a spot that would bury it further is rejected, so
   * `placeOnGround` nudges towards the anchor, then drops it. Unbounded
   * unless given. Bounds what the `lowest` rule can do on relief the slope
   * check does not see, such as a dip under one rim probe.
   */
  maxBury?: number;
}

export interface GroundSpot {
  x: number;
  y: number;
  z: number;
}

/** Ground heights under a footprint: the centre, then `RIM_PROBES` points round its rim from +x. */
function footprintHeights(field: GroundField, x: number, z: number, radius: number): number[] {
  return [
    field.sampleHeight(x, z),
    ...RIM_ANGLES.map((a) => field.sampleHeight(x + Math.cos(a) * radius, z + Math.sin(a) * radius)),
  ];
}

/**
 * The candidate positions for an object asked for at `spot`: the spot itself,
 * then nudged back towards `anchor` (its cell centre) in steps, ending at the
 * anchor. Callers that pick their footprint per candidate iterate this and
 * check each with `standOnGround`; `placeOnGround` does it for a fixed one.
 */
export function nudgedTowards(spot: { x: number; z: number }, anchor: { x: number; z: number }): { x: number; z: number }[] {
  return NUDGE_STEPS.map((t) => ({ x: anchor.x + (spot.x - anchor.x) * t, z: anchor.z + (spot.z - anchor.z) * t }));
}

/**
 * Whether an object can stand at exactly (x, z), and where. Null if any of
 * the ground under its footprint is too low (at or under the sea), the
 * ground across it is too steep, or (with `maxBury`) resting on it would sink
 * the base too far under the ground at its centre. The Y is the probe it
 * stands on (see `StandOn`) minus `sink`.
 */
export function standOnGround(field: GroundField, x: number, z: number, options: GroundPlacementOptions): GroundSpot | null {
  const { footprintRadius: radius, sink, maxSlope, standOn = "lowest", maxBury } = options;
  const heights = footprintHeights(field, x, z, radius);
  const lowest = Math.min(...heights);
  if (lowest < MIN_GROUND_HEIGHT) return null;
  const slope = Math.hypot(heights[PLUS_X] - heights[MINUS_X], heights[PLUS_Z] - heights[MINUS_Z]) / (2 * radius);
  if (slope > maxSlope) return null;
  const y = (standOn === "centre" ? heights[0] : lowest) - sink;
  if (maxBury !== undefined && heights[0] - y > maxBury) return null;
  return { x, y, z };
}

/**
 * Where an object asked for at `spot` actually stands. If the ground there is
 * too low (at or under the sea), too steep, or would bury the base deeper
 * than `maxBury`, the spot is nudged back towards `anchor` (its cell centre);
 * if no point on the way works it is dropped (null).
 */
export function placeOnGround(
  field: GroundField,
  spot: { x: number; z: number },
  anchor: { x: number; z: number },
  options: GroundPlacementOptions
): GroundSpot | null {
  for (const candidate of nudgedTowards(spot, anchor)) {
    const stood = standOnGround(field, candidate.x, candidate.z, options);
    if (stood) return stood;
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
