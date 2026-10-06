/**
 * Per-rock variation (issue #49). Pure, no Three.js.
 *
 * A rock's look is derived deterministically from its decoration data and
 * its cell's biome, so the same map draws the same rocks on every client:
 * which of the faceted variants it uses, a base colour by biome with a tint
 * within ±15% of it, a non-uniform stretch, a small tilt, how deep it is
 * buried, and a size class (large outcrops on ROCK cells, medium on GRASS,
 * small on SAND).
 *
 * Colour and size were retuned after an A/B at ship zoom (camera 3.5-4.3
 * units off, 65 m per unit) where the rocks could not be found: a rock
 * painted with the ground's own `highlandRock` vanishes on a summit, and a
 * light pebble vanishes on sand. The base colours are darker and less warm
 * than the ground they sit on, and the sizes are roughly doubled.
 */
import type { Biome } from "../../game/types";
import { ROCK_UNIT_RADIUS, ROCK_VARIANT_COUNT, rockVariantRadii } from "./rockGeometry";
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
  /** The biome's base colour, an sRGB hex (`ROCK_BASE_COLOR`). */
  baseColor: number;
  /** Multiplier on the base colour, within 1 ± ROCK_TINT_SPREAD. */
  tint: number;
  /** Full scale per axis: decoration scale × size class × stretch, shrunk uniformly to `ROCK_MAX_EXTENT`. */
  scale: readonly [number, number, number];
  /** Turn about the vertical axis (radians). */
  yaw: number;
  /** Small turns about the local x and z axes (radians). */
  tilt: readonly [number, number];
  /** Extra depth below the ground contact, in world units at scale 1. */
  bury: number;
  sizeClass: RockSizeClass;
}

/**
 * Base colour per biome, sRGB hex: each is clearly darker and less warm than
 * the ground it stands on (`palette.ts`), so a rock reads against it at ship
 * zoom. Grey-brown on sand (dry sand is 0xe3cf9c), a mid-dark neutral grey on
 * the jungle green, and a dark slate on the summits (highland rock is
 * 0x9d8d79, which the rocks themselves used to be painted with).
 */
export const ROCK_BASE_COLOR: Readonly<Record<Biome, number>> = {
  SAND: 0x665f55,
  GRASS: 0x5a5c5a,
  // Darker slates (0x3d4248) read as holes next to the summit's own shaded faces.
  ROCK: 0x565c64,
};
export const ROCK_TINT_SPREAD = 0.15;
/** Per-axis stretch on top of the decoration and class scale. */
export const ROCK_STRETCH_RANGE: readonly [number, number] = [0.75, 1.3];
export const ROCK_TILT_RANGE: readonly [number, number] = [-0.18, 0.18];
/** Extra bury depth, world units at scale 1 (scaled by the rock's height). */
export const ROCK_BURY_RANGE: readonly [number, number] = [0, 0.025];
/**
 * Scale multiplier per size class. With the generator's decoration scales
 * (0.8-1.6 on summits, 0.8-1.4 on grass, 0.6-1 on beaches) a large outcrop
 * is a boulder about a palm canopy across, and a small one a knee-to-waist
 * high rock rather than a pebble.
 */
export const ROCK_SIZE_CLASS_SCALE: Readonly<Record<RockSizeClass, number>> = {
  large: 2.2,
  medium: 1.5,
  small: 1,
};
/**
 * Farthest a drawn rock reaches from its origin in the ground plane, world
 * units (#53). Just inside a hex's inradius (√3/2 ≈ 0.87, `hexToWorld`), so
 * the ground probed under a rock stays within its own cell's reach. Without
 * it a large slab at the generator's biggest scale (1.6) would reach
 * 0.22 × 1.6 × 2.2 × 1.3 (stretch) × 1.3 (slab radius) ≈ 1.31 units. A rock
 * over the cap is shrunk uniformly, so only the very biggest slabs change.
 */
export const ROCK_MAX_EXTENT = 0.85;

const SIZE_CLASS_BY_BIOME: Readonly<Record<Biome, RockSizeClass>> = {
  ROCK: "large",
  GRASS: "medium",
  SAND: "small",
};

/** Large outcrops on ROCK cells, medium rocks on GRASS, small ones on SAND. */
export function rockSizeClass(biome: Biome | undefined): RockSizeClass {
  return biome ? SIZE_CLASS_BY_BIOME[biome] : "medium";
}

/** How far the drawn rock reaches from its origin in the ground plane, world units (before tilt). */
export function rockDrawnRadius(v: Pick<RockVariation, "variant" | "scale">): number {
  const [rx, , rz] = rockVariantRadii(v.variant);
  return Math.max(v.scale[0] * rx, v.scale[2] * rz) * ROCK_UNIT_RADIUS;
}

/** How high the drawn rock's top is above its origin (the ground contact), world units. */
export function rockDrawnHeight(v: Pick<RockVariation, "variant" | "scale">): number {
  return v.scale[1] * rockVariantRadii(v.variant)[1] * ROCK_UNIT_RADIUS;
}

/** The per-axis scale, shrunk uniformly if the rock would reach past `ROCK_MAX_EXTENT`. */
function cappedScale(variant: number, scale: readonly [number, number, number]): readonly [number, number, number] {
  const radius = rockDrawnRadius({ variant, scale });
  if (radius <= ROCK_MAX_EXTENT) return scale;
  const k = ROCK_MAX_EXTENT / radius;
  return [scale[0] * k, scale[1] * k, scale[2] * k];
}

/**
 * The rock's variation; `sizeClass` overrides the biome's (small stones).
 * Hashes the placement's X, Z, rotation and scale, never its Y, so the
 * placement can derive the same variation before it knows the ground height.
 */
export function rockVariation(p: RockPlacement, sizeClass: RockSizeClass = rockSizeClass(p.biome)): RockVariation {
  const next = stream(seedOf([p.worldX, p.worldZ, p.rotation, p.scale], 0x2f6b1a7d));
  const base = p.scale * ROCK_SIZE_CLASS_SCALE[sizeClass];
  const variant = Math.min(ROCK_VARIANT_COUNT - 1, Math.floor(next() * ROCK_VARIANT_COUNT));
  const tint = 1 + (next() * 2 - 1) * ROCK_TINT_SPREAD;
  const stretched: readonly [number, number, number] = [
    base * lerpRange(ROCK_STRETCH_RANGE, next()),
    base * lerpRange(ROCK_STRETCH_RANGE, next()),
    base * lerpRange(ROCK_STRETCH_RANGE, next()),
  ];
  return {
    variant,
    baseColor: ROCK_BASE_COLOR[p.biome ?? "GRASS"],
    tint,
    scale: cappedScale(variant, stretched),
    yaw: p.rotation,
    tilt: [lerpRange(ROCK_TILT_RANGE, next()), lerpRange(ROCK_TILT_RANGE, next())],
    bury: lerpRange(ROCK_BURY_RANGE, next()),
    sizeClass,
  };
}
