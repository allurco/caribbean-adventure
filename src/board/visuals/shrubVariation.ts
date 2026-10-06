/**
 * Per-shrub variation (issue #49). Pure, no Three.js.
 *
 * A shrub's look is derived deterministically from its placement (the
 * `palmVariation.ts` pattern), so a map draws the same vegetation on every
 * client: a width and a height stretch, a tint of the kind's colours and a
 * sway phase. The placement itself (shrubPlacement.ts) comes from a hash of
 * the whole terrain seed and the cell, so the seed reaches everything here
 * through it.
 */
import { PALETTE_HEX } from "./palette";
import type { ShrubKind } from "./shrubGeometry";
import { lerpRange, seedOf, stream } from "./variationStream";

/** Where a shrub stands, after ground placement. */
export interface ShrubPlacement {
  kind: ShrubKind;
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Turn about the vertical axis (radians). */
  rotation: number;
  scale: number;
}

export interface ShrubVariation {
  kind: ShrubKind;
  /** Full scale per axis: placement scale × stretch, the same in x and z. */
  scale: readonly [number, number, number];
  /** Turn about the vertical axis (radians). */
  yaw: number;
  /**
   * Per-channel multiplier on the geometry's colours (`instanceColor`): a
   * luminance tint within 1 ± SHRUB_TINT_SPREAD, with green nudged against
   * red and blue by up to SHRUB_HUE_SPREAD.
   */
  tint: readonly [number, number, number];
  /** Sway phase offset (radians), in [0, 2π). */
  phase: number;
}

/**
 * Colours per kind, sRGB hex, chosen against the ground each stands on
 * (`palette.ts`). Bush leaves are a warmer, lighter green than both the jungle
 * floor (0x367a43) and the palm fronds (0x4f8a34), so a bush reads as its own
 * plant under a palm. Tuft blades are a dry olive straw, darker and greener
 * than the dry sand (0xe3cf9c) so they do not vanish into the beach, on a
 * mound of darker dry earth.
 */
export const SHRUB_COLOR_HEX: Readonly<Record<ShrubKind, { stem: number; foliage: number }>> = {
  bush: { stem: PALETTE_HEX.palmTrunk, foliage: 0x6aa23f },
  tuft: { stem: 0x8a7d52, foliage: 0xa89f58 },
};

export const SHRUB_TINT_SPREAD = 0.12;
export const SHRUB_HUE_SPREAD = 0.05;
/** Width (x and z) stretch on top of the placement scale. */
export const SHRUB_WIDTH_RANGE: readonly [number, number] = [0.85, 1.2];
/** Height stretch on top of the placement scale. */
export const SHRUB_HEIGHT_RANGE: readonly [number, number] = [0.8, 1.25];

const TAU = Math.PI * 2;
const SHRUB_VARIATION_SALT = 0x71c3a5e9;

export function shrubVariation(p: ShrubPlacement): ShrubVariation {
  const next = stream(seedOf([p.worldX, p.worldZ, p.rotation, p.scale], SHRUB_VARIATION_SALT));
  const width = p.scale * lerpRange(SHRUB_WIDTH_RANGE, next());
  const height = p.scale * lerpRange(SHRUB_HEIGHT_RANGE, next());
  const tint = 1 + (next() * 2 - 1) * SHRUB_TINT_SPREAD;
  const hue = (next() * 2 - 1) * SHRUB_HUE_SPREAD;
  return {
    kind: p.kind,
    scale: [width, height, width],
    yaw: p.rotation,
    tint: [tint - hue, tint + hue, tint - hue],
    phase: next() * TAU,
  };
}
