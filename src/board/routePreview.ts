/**
 * What the turn's reach and a previewed route look like on the water (#213):
 * the hexes in reach shaded by what they cost (the nearest strongest), and
 * the route as a dotted line along the curve the ship will sail through the
 * hex centres (`buildShipPath`, shipMotion.ts). Pure.
 */
import type { Hex } from "../game/hex";
import { hexToWorld } from "../game/hex";
import type { Reach } from "../game/reach";
import { buildShipPath, directionHeading, pathPoint, type Point } from "./shipMotion";

/** Fill opacity of a hex in reach by its cost: 1, 2, 3 and anything farther. */
export const REACH_OPACITY: readonly number[] = [0.3, 0.18, 0.1, 0.05];

/** World units between the dots of a route. */
export const ROUTE_DOT_SPACING = 0.3;
/** The dots start this far from the ship's hex centre, clear of the hull. */
export const ROUTE_DOT_CLEARANCE = 0.55;

export const reachOpacity = (cost: number): number =>
  REACH_OPACITY[Math.min(Math.max(cost, 1), REACH_OPACITY.length) - 1];

/** The hexes in reach grouped by cost, cheapest first: one draw per shade. */
export function reachLayers(reach: Reach): { cost: number; hexes: Hex[] }[] {
  const byCost = new Map<number, Hex[]>();
  for (const { hex, cost } of reach.hexes) {
    const shade = Math.min(cost, REACH_OPACITY.length);
    const list = byCost.get(shade) ?? [];
    list.push(hex);
    byCost.set(shade, list);
  }
  return [...byCost.entries()].sort(([a], [b]) => a - b).map(([cost, hexes]) => ({ cost, hexes }));
}

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
