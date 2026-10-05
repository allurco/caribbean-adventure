/**
 * Per-rock variation (issue #49). Pure, no Three.js.
 *
 * A rock's look is derived deterministically from its decoration data and
 * its cell's biome, so the same map draws the same rocks on every client:
 * which of the faceted variants it uses, a tint within ±8% of the palette
 * colour, a non-uniform stretch, a small tilt, how deep it is buried, and a
 * size class (large outcrops on ROCK cells, medium on GRASS, small on SAND).
 */
import type { Biome } from "../../game/types";
import { ROCK_VARIANT_COUNT } from "./rockGeometry";
import { lerpRange, seedOf, stream } from "./variationStream";

/** Where a rock stands, after ground placement. */
export interface RockPlacement {
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Decoration rotation (radians). */
  rotation: number;
  scale: number;
  /** Biome of the rock's cell; unknown counts as grass. */
  biome?: Biome;
}

export type RockSizeClass = "large" | "medium" | "small";

export interface RockVariation {
  /** Which faceted variant to draw, in [0, ROCK_VARIANT_COUNT). */
  variant: number;
  /** Multiplier on the palette colour, within 1 ± ROCK_TINT_SPREAD. */
  tint: number;
  /** Full scale per axis: decoration scale × size class × stretch. */
  scale: readonly [number, number, number];
  /** Turn about the vertical axis (radians). */
  yaw: number;
  /** Small turns about the local x and z axes (radians). */
  tilt: readonly [number, number];
  /** Extra depth below the ground contact, in world units at scale 1. */
  bury: number;
  sizeClass: RockSizeClass;
}

export const ROCK_TINT_SPREAD = 0.08;
/** Per-axis stretch on top of the decoration and class scale. */
export const ROCK_STRETCH_RANGE: readonly [number, number] = [0.75, 1.3];
export const ROCK_TILT_RANGE: readonly [number, number] = [-0.18, 0.18];
/** Extra bury depth, world units at scale 1 (scaled by the rock's height). */
export const ROCK_BURY_RANGE: readonly [number, number] = [0, 0.025];
/** Scale multiplier per size class. */
export const ROCK_SIZE_CLASS_SCALE: Readonly<Record<RockSizeClass, number>> = {
  large: 1.5,
  medium: 1,
  small: 0.65,
};

const SIZE_CLASS_BY_BIOME: Readonly<Record<Biome, RockSizeClass>> = {
  ROCK: "large",
  GRASS: "medium",
  SAND: "small",
};

/** Large outcrops on ROCK cells, medium rocks on GRASS, small ones on SAND. */
export function rockSizeClass(biome: Biome | undefined): RockSizeClass {
  return biome ? SIZE_CLASS_BY_BIOME[biome] : "medium";
}

/** The rock's variation; `sizeClass` overrides the biome's (small stones). */
export function rockVariation(p: RockPlacement, sizeClass: RockSizeClass = rockSizeClass(p.biome)): RockVariation {
  const next = stream(seedOf([p.worldX, p.worldZ, p.rotation, p.scale], 0x2f6b1a7d));
  const base = p.scale * ROCK_SIZE_CLASS_SCALE[sizeClass];
  return {
    variant: Math.min(ROCK_VARIANT_COUNT - 1, Math.floor(next() * ROCK_VARIANT_COUNT)),
    tint: 1 + (next() * 2 - 1) * ROCK_TINT_SPREAD,
    scale: [
      base * lerpRange(ROCK_STRETCH_RANGE, next()),
      base * lerpRange(ROCK_STRETCH_RANGE, next()),
      base * lerpRange(ROCK_STRETCH_RANGE, next()),
    ],
    yaw: p.rotation,
    tilt: [lerpRange(ROCK_TILT_RANGE, next()), lerpRange(ROCK_TILT_RANGE, next())],
    bury: lerpRange(ROCK_BURY_RANGE, next()),
    sizeClass,
  };
}
