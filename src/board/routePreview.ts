/**
 * What a previewed route looks like on the water (#213): a dotted line
 * along the curve the ship will sail through the hex centres
 * (`buildShipPath`, shipMotion.ts). Pure.
 */
import type { Hex } from "../game/hex";
import { hexToWorld } from "../game/hex";
import { buildShipPath, directionHeading, pathPoint, type Point } from "./shipMotion";

/** World units between the dots of a route. */
export const ROUTE_DOT_SPACING = 0.3;
/** The dots start this far from the ship's hex centre, clear of the hull. */
export const ROUTE_DOT_CLEARANCE = 0.55;

/** `x` moved by whole `period`s to lie within half a period of `reference`. */
const nearest = (x: number, reference: number, period: number): number =>
  Number.isFinite(period) ? x + period * Math.round((reference - x) / period) : x;

/**
 * The route's hex centres (world xz) from `start`, each taken the short way
 * over the seam from the one before on a map `wrapWidth` wide, so the line
 * runs on from the ship's side of the seam.
 */
export function routePoints(start: Hex, route: readonly Hex[], wrapWidth: number): Point[] {
  const [sx, , sz] = hexToWorld(start);
  const points: Point[] = [[sx, sz]];
  for (const h of route) {
    const [x, , z] = hexToWorld(h);
    points.push([nearest(x, points[points.length - 1][0], wrapWidth), z]);
  }
  return points;
}

/**
 * Dots every ROUTE_DOT_SPACING along the smooth course from `start` through
 * the route's hex centres, leaving along the first leg, from clear of the
 * ship to the last hex's centre (which always has a dot).
 */
export function routeDots(start: Hex, route: readonly Hex[], wrapWidth: number, spacing = ROUTE_DOT_SPACING): Point[] {
  if (route.length === 0) return [];
  const [from, ...waypoints] = routePoints(start, route, wrapWidth);
  const first = waypoints[0];
  const path = buildShipPath(from, directionHeading([first[0] - from[0], first[1] - from[1]]), waypoints);
  const dots: Point[] = [];
  const count = Math.max(1, Math.round((path.length - ROUTE_DOT_CLEARANCE) / spacing));
  const step = (path.length - ROUTE_DOT_CLEARANCE) / count;
  for (let i = 1; i <= count; i++) dots.push(pathPoint(path, ROUTE_DOT_CLEARANCE + i * step));
  return dots;
}

/**
 * The whole course of a planned route (#213) when the ship's first move on
 * it lands on `to`: every hex centre of `plan`, so the ship is given the
 * route at once and sails it as one curve while the moves arrive one by one.
 * Null when `to` is not the route's first hex.
 */
export function plannedCourse(plan: readonly Hex[] | null, to: Point): Point[] | null {
  if (!plan || plan.length === 0) return null;
  const [x, , z] = hexToWorld(plan[0]);
  if (Math.abs(x - to[0]) > 1e-6 || Math.abs(z - to[1]) > 1e-6) return null;
  return plan.map((h): Point => {
    const [hx, , hz] = hexToWorld(h);
    return [hx, hz];
  });
}
