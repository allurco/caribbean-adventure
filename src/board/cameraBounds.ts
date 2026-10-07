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

/**
 * Direction from the camera target to the camera (rotation is disabled): due
 * south of the target, so the camera looks due north along world −z with row
 * 0 at the top of the screen. The yaw is aligned with the map axes so that on
 * a map that wraps east–west (#36) a screen-horizontal drag pans along world
 * x, the wrap axis, only, and a vertical one along world z only, Civ style;
 * the old diagonal view ([0.4, 0.6, 0.4]) made every drag move the focus in
 * both and showed the map's north and south edges as diagonals. Same pitch as
 * that view: the same height over the same horizontal setback.
 *
 * Unit length, so the camera sits at `target + distance × CAMERA_DIRECTION`
 * exactly `distance` from its target: every configured distance (the map
 * presets' `isoDistance`, the `dist` URL parameter, `CAMERA_MAX_DISTANCE`) is
 * a real camera-to-target distance, the one MapControls measures (#78).
 */
export const CAMERA_DIRECTION: readonly [number, number, number] = unitVector([0, 0.6, 0.4 * Math.SQRT2]);
/** Downward angle of the view direction, in radians (~46.7 degrees). */
export const CAMERA_PITCH = Math.atan2(
  CAMERA_DIRECTION[1],
  Math.hypot(CAMERA_DIRECTION[0], CAMERA_DIRECTION[2])
);
/** Vertical field of view in degrees. */
export const CAMERA_FOV = 45;
/** MapControls zoom-out limit (camera-to-target distance). */
export const CAMERA_MAX_DISTANCE = 28;
/**
 * MapControls zoom-in limit (camera-to-target distance), the same world
 * distance on every map size (#62): a town zoom (#90), close enough to walk
 * the eye down a port's street, across its square and up to its fort. The
 * #84 village and fort were approved from dist 1.0 to 1.2 in the units before
 * #78 (0.82 to 0.99 now); 0.8 reaches the closest of those views. Below
 * `OLD_CAMERA_MIN_DISTANCE` the focus follows the ground (`groundFollow.ts`)
 * and the near plane closes in (`cameraNearFor`); the fine ring of the ocean
 * grid must still cover the view here (oceanGrid.test.ts).
 */
export const CAMERA_MIN_DISTANCE = 0.8;
/**
 * The zoom floor before the town zoom (#90): the small map's old ship-zoom
 * floor, 0.15 of its old iso distance (0.8 × 36). Every view from here out
 * behaves as it did before the town zoom.
 */
export const OLD_CAMERA_MIN_DISTANCE = 4.32;
/** The camera's near plane from `OLD_CAMERA_MIN_DISTANCE` out, world units. */
export const CAMERA_NEAR = 0.1;
/**
 * Near plane for a camera `distance` from its focus: `CAMERA_NEAR` from the
 * old floor out, and closer in the same share of the distance, so at town
 * zoom roofs, palms and the fort's flag a few metres from the lens are not
 * cut away, while the depth buffer keeps the precision it had at the old
 * floor relative to what is on screen.
 */
export function cameraNearFor(distance: number): number {
  return CAMERA_NEAR * Math.min(1, distance / OLD_CAMERA_MIN_DISTANCE);
}
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

/** Hoisted: CAMERA_DIRECTION above is built with it. */
function unitVector([x, y, z]: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
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

/**
 * Furthest horizontal distance from the camera target to any point of the sea
 * plane inside the view frustum, for a camera `distance` from the target,
 * looking down at `pitch` radians, with vertical FOV `fovDeg` and `aspect`.
 *
 * The visible patch of sea is the quadrilateral where the four frustum corner
 * rays hit the plane, so its furthest point is one of those four hits.
 * Infinity if a corner ray never comes down to the sea (horizon in view).
 *
 * With a `drop` (world units, ≥ 0) the rays are followed on to a plane that
 * far below the sea instead, the seabed say, and the reach is still measured
 * horizontally from the target on the sea plane. This is not the sea-plane
 * reach of a camera `drop / sin(pitch)` further out: that camera's target
 * would sit `drop / tan(pitch)` further along the view axis, so its reach
 * would be measured from the wrong point.
 */
export function groundViewReach(
  distance: number,
  pitch: number,
  fovDeg: number,
  aspect: number,
  drop = 0
): number {
  const t = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const sin = Math.sin(pitch);
  const cos = Math.cos(pitch);
  const height = distance * sin + drop; // camera height over the plane being hit
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
