/**
 * Per-palm variation (issue #14). Pure, no Three.js.
 *
 * Each palm's look is derived deterministically from its decoration data, so a
 * grove looks the same on every render and every client, but no two palms in
 * it are copies.
 */
import { lerpRange, seedOf, stream } from "./variationStream";

/** Where a palm stands, after ground placement. */
export interface PalmPlacement {
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Decoration rotation (radians). */
  rotation: number;
  scale: number;
}

export interface PalmVariation {
  /** Vertical stretch on top of the decoration scale. */
  heightScale: number;
  /** Tilt (radians) towards the trunk's curve; negative straightens it a little. */
  lean: number;
  /** Turn about the vertical axis (radians): the direction the trunk curves. */
  yaw: number;
  /** Extra turn of the crown about the trunk top (radians), in [0, 2π). */
  crownTwist: number;
  /** Sway phase offset (radians), in [0, 2π). */
  phase: number;
}

export const PALM_HEIGHT_RANGE: readonly [number, number] = [0.8, 1.25];
export const PALM_LEAN_RANGE: readonly [number, number] = [-0.05, 0.3];

const TAU = Math.PI * 2;

export function palmVariation(p: PalmPlacement): PalmVariation {
  const next = stream(seedOf([p.worldX, p.worldZ, p.rotation, p.scale]));
  return {
    heightScale: lerpRange(PALM_HEIGHT_RANGE, next()),
    lean: lerpRange(PALM_LEAN_RANGE, next()),
    yaw: p.rotation,
    crownTwist: next() * TAU,
    phase: next() * TAU,
  };
}
