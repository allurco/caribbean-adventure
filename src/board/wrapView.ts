/**
 * Pure view maths for a map that wraps east–west (#36), Civ style: the camera
 * pans east or west forever (the world is drawn in copies one wrap width
 * apart that follow it), while north and south it never shows anything past
 * a margin of sea (`WRAP_BAND_PADDING`) beyond the top or bottom row of hexes.
 */

/**
 * Where the four corners of the view meet the sea plane, relative to the
 * camera target, per unit of camera-to-target distance (it scales linearly).
 */
export interface GroundFootprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A band of world z the view must stay inside. */
export interface ZBand {
  minZ: number;
  maxZ: number;
}

const SQRT3 = Math.sqrt(3);

/**
 * The ground footprint of a perspective camera that sits along `offset` from
 * its target (any length; rotation is fixed), with vertical FOV `fovDeg` and
 * width/height `aspect`. Null if the top of the view reaches the horizon.
 */
export function groundFootprint(
  offset: readonly [number, number, number],
  fovDeg: number,
  aspect: number
): GroundFootprint | null {
  const len = Math.hypot(offset[0], offset[1], offset[2]);
  const o = [offset[0] / len, offset[1] / len, offset[2] / len];
  const f = [-o[0], -o[1], -o[2]];
  // right = f × worldUp, up = right × f
  const rLen = Math.hypot(f[2], f[0]);
  const right = [-f[2] / rLen, 0, f[0] / rLen];
  const up = [
    right[1] * f[2] - right[2] * f[1],
    right[2] * f[0] - right[0] * f[2],
    right[0] * f[1] - right[1] * f[0],
  ];
  const t = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const out: GroundFootprint = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const dir = [0, 1, 2].map((i) => f[i] + sy * t * up[i] + sx * aspect * t * right[i]);
      // At (or within rounding of) the horizon the ray never comes down.
      if (dir[1] > -1e-9) return null;
      const s = -o[1] / dir[1];
      const x = o[0] + s * dir[0];
      const z = o[2] + s * dir[2];
      out.minX = Math.min(out.minX, x);
      out.maxX = Math.max(out.maxX, x);
      out.minZ = Math.min(out.minZ, z);
      out.maxZ = Math.max(out.maxZ, z);
    }
  }
  return out;
}

/**
 * The band of world z that hexes cover in every column of a map `rows` tall
 * (odd-q offset, see hex.ts): from the top edge of the odd columns' first row
 * to the bottom edge of the even columns' last row. Inside it the view only
 * ever shows hexes.
 */
export function mapBand(rows: number): ZBand {
  return { minZ: 0, maxZ: SQRT3 * (rows - 0.5) };
}

/**
 * Sea the view may show past the top and bottom rows: two rows' worth. The
 * zoom-out cap (`maxViewDistance`) uses the bare `mapBand`, so the whole map
 * still just fits on screen at full zoom-out; the focus clamp (`clampFocusZ`)
 * uses the band padded by this, so even at full zoom-out the focus can still
 * travel twice this north–south instead of being pinned (and, as the camera
 * looks along a diagonal, only ever sliding diagonally on screen).
 */
export const WRAP_BAND_PADDING = 2 * SQRT3;

/** `band` grown by `padding` on both sides. */
export function paddedBand(band: ZBand, padding: number): ZBand {
  return { minZ: band.minZ - padding, maxZ: band.maxZ + padding };
}

/** Furthest the camera may zoom out so the whole view fits in `band` (and within `limit`). */
export function maxViewDistance(footprint: GroundFootprint, band: ZBand, limit: number): number {
  return Math.min(limit, (band.maxZ - band.minZ) / (footprint.maxZ - footprint.minZ));
}

/**
 * The focus z nearest `z` whose view, at camera distance `distance`, stays in
 * `band`. If the view is taller than the band, the view is centred on it.
 */
export function clampFocusZ(z: number, distance: number, footprint: GroundFootprint, band: ZBand): number {
  const lo = band.minZ - distance * footprint.minZ;
  const hi = band.maxZ - distance * footprint.maxZ;
  if (lo > hi) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, z));
}

/**
 * Which copies of the world, one `period` apart and counted from the copy the
 * focus is in, cover everything the camera can see at up to `maxDistance`,
 * with `margin` world units to spare (things that poke past their strip, such
 * as a ship sailing across the seam).
 */
export function wrapCopyRange(
  footprint: GroundFootprint,
  maxDistance: number,
  period: number,
  margin: number
): { from: number; to: number } {
  return {
    from: Math.floor((maxDistance * footprint.minX - margin) / period),
    to: Math.ceil((maxDistance * footprint.maxX + margin) / period),
  };
}

/**
 * Where an animation towards world x `to` should start so it takes the short
 * way round: `from` moved by the whole number of wrap widths (`period`) that
 * brings it nearest `to`. On screen nothing jumps, since every copy of the
 * world moves the same way. Infinity (no wrap) leaves `from` alone.
 */
export function seamAwareStart(from: number, to: number, period: number): number {
  if (!Number.isFinite(period)) return from;
  return from + period * Math.round((to - from) / period);
}

/**
 * How far to move something anchored at world x `anchor` so it lands in the
 * copy of the world nearest `pointerX`, in whole wrap widths (`period`).
 * Used to show a tooltip on the copy the pointer is over: on a very wide view
 * the same ship can be on screen twice. Infinity (no wrap) gives 0.
 */
export function copyShiftToward(anchor: number, pointerX: number, period: number): number {
  return seamAwareStart(anchor, pointerX, period) - anchor;
}
