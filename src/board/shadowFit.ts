import { groundViewReach } from "./cameraBounds";

/**
 * Pure helpers that fit the sun's orthographic shadow box to the view (#48).
 *
 * The shadow box follows the camera target (SunLight.tsx). With a fixed
 * half-extent sized for full zoom-out, zooming in on a ship left each shadow
 * texel spanning several screen pixels, so hull and palm shadows showed
 * stair-stepped edges. Fitting the box to what is on screen gives the same
 * shadow map a finer texel the closer the camera gets.
 */

export interface ShadowFit {
  /** Downward angle of the view direction, radians (CAMERA_PITCH). */
  pitch: number;
  /** Vertical field of view, degrees (CAMERA_FOV). */
  fovDeg: number;
  /** Sun elevation above the horizon, degrees. */
  sunElevationDeg: number;
  /** Tallest thing that casts or receives a shadow, world units above the sea. */
  casterHeight: number;
  /** Deepest thing that receives a shadow, world units below the sea (positive): the seabed floor. */
  receiverDepth: number;
  /** Smallest half-extent, so the box never degenerates. */
  minExtent: number;
  /** Largest half-extent: the old fixed size, used at full zoom-out. */
  maxExtent: number;
}

/** Everything SunLight needs to size, place and filter its shadow map. */
export interface SunShadowSettings {
  /** Shadow map side, texels. */
  mapSize: number;
  fit: ShadowFit;
  /** Fraction of the current extent the fit must move before the box is rebuilt. */
  hysteresis: number;
  /** Depth bias, in shadow texels (converted with the live texel and the depth range). */
  biasTexels: number;
  /** Normal bias, in shadow texels (converted with the live texel). */
  normalBiasTexels: number;
  /** PCF sample disc radius, texels (three's `shadow.radius`). */
  radius: number;
  /** Shadow camera near and far planes along the sun, world units. */
  near: number;
  far: number;
}

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Half-extent of the shadow box for a camera `distance` from its target on a
 * viewport of `aspect`.
 *
 * The box is square and perpendicular to the sun. A caster and the shadow it
 * casts lie on the same light ray, so they have the same position across the
 * box: the box only has to cover the receivers on screen. A receiver `y` off
 * the sea plane is displaced across the box by |y|·cos(elevation), so two
 * layers of receiver bound the box, and the larger wins:
 *
 * - On and above the sea: the sea-plane reach of the view (`groundViewReach`;
 *   everything above the sea is hit earlier along the same frustum rays, so
 *   it is nearer the target) plus casterHeight·cos(e) for hill tops and decks.
 * - Below the sea: the seabed receives too (hull shadows show through the
 *   water), and along the far corner ray a plane `receiverDepth` down is hit
 *   beyond the sea-plane reach (`groundViewReach` with that drop, no
 *   refraction, so on the safe side), plus receiverDepth·cos(e).
 *
 * Clamped to [minExtent, maxExtent]; Infinity (horizon in view) clamps to max.
 *
 * `focusHeight` (≥ 0) is how far the camera target sits above the sea: at
 * town zoom it follows the ground (#90), so the sea and the seabed lie that
 * much further below it and the view reaches further across them.
 */
export function shadowExtentFor(distance: number, aspect: number, fit: ShadowFit, focusHeight = 0): number {
  const cosElevation = Math.cos(toRadians(fit.sunElevationDeg));
  const lift = Math.max(0, focusHeight);
  const seaReach = groundViewReach(distance, fit.pitch, fit.fovDeg, aspect, lift);
  const seabedReach = groundViewReach(distance, fit.pitch, fit.fovDeg, aspect, lift + fit.receiverDepth);
  const wanted = Math.max(
    seaReach + fit.casterHeight * cosElevation,
    seabedReach + fit.receiverDepth * cosElevation
  );
  return Math.min(fit.maxExtent, Math.max(fit.minExtent, wanted));
}

/** World-unit size of one shadow-map texel for a box of `extent` half-width. */
export function shadowTexel(extent: number, mapSize: number): number {
  return (2 * extent) / mapSize;
}

/**
 * three's `shadow.bias` is added to the receiver's depth in the shadow map's
 * [0, 1] range, which an orthographic shadow camera spreads linearly from
 * near to far: a bias of `texels` shadow texels is that many texels of world
 * depth over the depth range. Negative: it moves the receiver towards the
 * light so a surface does not shadow itself.
 */
export function shadowDepthBias(texels: number, texel: number, near: number, far: number): number {
  return -(texels * texel) / (far - near);
}

/**
 * Whether the box should be rebuilt for a new extent `next`.
 *
 * The box must never be smaller than the view needs, or receivers at the far
 * screen corners fall outside it and lose their shadow, so any growth refits
 * at once. Shrinking only costs texel resolution, and each rebuild re-snaps
 * the texel grid, so the box only shrinks once the fit has fallen more than
 * `hysteresis` (a fraction of the current extent) below it: zooming in by
 * one wheel tick (5%) moves the extent by less than that, because the caster
 * margin does not scale with the zoom, so the box shrinks every second tick
 * and the easing between ticks never re-snaps it.
 */
export function shadowBoxNeedsRefit(
  current: number | undefined,
  next: number,
  hysteresis: number
): boolean {
  if (current === undefined) return true;
  if (next > current) return true;
  return current - next > hysteresis * current;
}

export interface HeightRange {
  min: number;
  max: number;
}

/**
 * Depth range, along the sun, of everything that can fall inside a box of
 * `extent` half-width whose light sits `sunDistance` from the target along a
 * sun `elevationDeg` above the horizon, with the scene spanning `heights`
 * (world y, sea level 0).
 *
 * Across the box, a point at horizontal offset `a` along the sun's azimuth and
 * height `y` sits at a·sin(e) − y·cos(e) from the centre; at the box edge its
 * depth offset a·cos(e) + y·sin(e) works out to ±extent·cot(e) + y/sin(e).
 * The shadow camera's near and far planes must bracket this range.
 */
export function shadowDepthRange(
  extent: number,
  sunDistance: number,
  elevationDeg: number,
  heights: HeightRange
): { near: number; far: number } {
  const e = toRadians(elevationDeg);
  const tilt = extent / Math.tan(e);
  const csc = 1 / Math.sin(e);
  return {
    near: sunDistance - tilt - heights.max * csc,
    far: sunDistance + tilt - heights.min * csc,
  };
}
