import type { Hex } from "../game/hex";
import { hexToWorld } from "../game/hex";

/**
 * Pure helpers that keep the map camera over the map.
 *
 * The camera focus (the MapControls target, on the sea plane) is clamped to
 * the convex hull of the cell centres grown by `padding`, i.e. it may drift
 * at most `padding` world units past the outermost hex. Clamping returns the
 * correction so the caller can shift the camera by the same amount and keep
 * the view angle unchanged.
 */

/** Direction from the camera target to the camera (rotation is disabled). */
export const CAMERA_OFFSET: [number, number, number] = [0.4, 0.6, 0.4];
/** Downward angle of the view direction, in radians (~46.7 degrees). */
export const CAMERA_PITCH = Math.atan2(
  CAMERA_OFFSET[1],
  Math.hypot(CAMERA_OFFSET[0], CAMERA_OFFSET[2])
);
/** Vertical field of view in degrees. */
export const CAMERA_FOV = 45;
/** MapControls zoom-out limit (camera-to-target distance). */
export const CAMERA_MAX_DISTANCE = 28;
/** How far past the outermost cell centre the focus may go: one hex. */
export const CAMERA_BOUNDS_PADDING = Math.sqrt(3);
/**
 * Widest viewport we size the ocean for (32:9 super-ultrawide is ~3.6).
 * The wider the screen, the further the top corners of the view reach.
 */
export const MAX_VIEW_ASPECT = 4;

export interface Point2 {
  x: number;
  z: number;
}

export interface CameraBounds {
  /** Convex hull of the cell centres, counter-clockwise in (x, z). */
  hull: Point2[];
  /** Allowed distance outside the hull, in world units. */
  padding: number;
}

export interface ClampResult {
  x: number;
  z: number;
  /** Correction applied: clamped minus input. Zero when already inside. */
  dx: number;
  dz: number;
}

function cross(o: Point2, a: Point2, b: Point2): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

// Hex centres involve sqrt(3), so collinear edge cells give tiny non-zero cross products.
const COLLINEAR_EPSILON = 1e-9;

/** Andrew's monotone chain; drops (near-)collinear points. */
function convexHull(points: readonly Point2[]): Point2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length <= 2) return sorted;
  const lower: Point2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= COLLINEAR_EPSILON) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= COLLINEAR_EPSILON) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function cameraBoundsFromHexes(hexes: readonly Hex[], padding: number): CameraBounds {
  const points = hexes.map((h) => {
    const [x, , z] = hexToWorld(h);
    return { x, z };
  });
  return { hull: convexHull(points), padding };
}

function closestOnSegment(p: Point2, a: Point2, b: Point2): Point2 {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / lenSq));
  return { x: a.x + abx * t, z: a.z + abz * t };
}

/** Clamp a focus point into the padded hull; returns the point and the correction. */
export function clampToCameraBounds(bounds: CameraBounds, x: number, z: number): ClampResult {
  const { hull, padding } = bounds;
  const unchanged = { x, z, dx: 0, dz: 0 };
  if (hull.length === 0) return unchanged;

  const p = { x, z };
  if (hull.length >= 3) {
    const inside = hull.every((a, i) => cross(a, hull[(i + 1) % hull.length], p) >= -COLLINEAR_EPSILON);
    if (inside) return unchanged;
  }

  let nearest = hull[0];
  let nearestSq = Infinity;
  hull.forEach((a, i) => {
    const q = closestOnSegment(p, a, hull[(i + 1) % hull.length]);
    const dSq = (q.x - x) ** 2 + (q.z - z) ** 2;
    if (dSq < nearestSq) {
      nearestSq = dSq;
      nearest = q;
    }
  });

  const dist = Math.sqrt(nearestSq);
  if (dist <= padding) return unchanged;
  const k = padding / dist;
  const cx = nearest.x + (x - nearest.x) * k;
  const cz = nearest.z + (z - nearest.z) * k;
  return { x: cx, z: cz, dx: cx - x, dz: cz - z };
}

/** Largest |x| or |z| the clamped focus can reach. */
export function cameraBoundsExtent({ hull, padding }: CameraBounds): number {
  return hull.reduce((m, p) => Math.max(m, Math.abs(p.x), Math.abs(p.z)), 0) + padding;
}

/**
 * Furthest horizontal distance from the camera target to any point of the sea
 * plane inside the view frustum, for a camera `distance` from the target,
 * looking down at `pitch` radians, with vertical FOV `fovDeg` and `aspect`.
 *
 * The visible patch of sea is the quadrilateral where the four frustum corner
 * rays hit the plane, so its furthest point is one of those four hits.
 * Infinity if a corner ray never comes down to the sea (horizon in view).
 */
export function groundViewReach(
  distance: number,
  pitch: number,
  fovDeg: number,
  aspect: number
): number {
  const t = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const sin = Math.sin(pitch);
  const cos = Math.cos(pitch);
  const height = distance * sin;
  const behind = distance * cos; // camera sits this far behind the target
  let reach = 0;
  for (const sy of [-1, 1]) {
    // Ray = forward + sy * t * up + sx * aspect * t * right (camera frame).
    const down = sin - sy * t * cos;
    if (down <= 0) return Infinity;
    const s = height / down;
    const ahead = s * (cos + sy * t * sin) - behind;
    const side = s * aspect * t;
    reach = Math.max(reach, Math.hypot(ahead, side));
  }
  return reach;
}

/**
 * Side of the square ocean plane (centred on the origin) that keeps its edge
 * off screen: from any clamped focus the view reaches at most `reach` further.
 */
export function oceanPlaneSize(bounds: CameraBounds, reach: number): number {
  return 2 * (cameraBoundsExtent(bounds) + reach);
}
