/**
 * One frame of the camera's focus flight (#98): the focus on the sea plane
 * and the camera-to-focus distance each move `alpha` of the way to the goal,
 * so the zoom lands with the focus. A goal without a distance keeps the zoom.
 */

export interface FlightView {
  x: number;
  z: number;
  distance: number;
}

export interface FlightGoal {
  x: number;
  z: number;
  distance?: number;
}

/** How close the focus must come to the goal, in world units. */
const ARRIVE_FOCUS = 0.1;
/** How close the distance must come to the goal's, in world units. */
const ARRIVE_DISTANCE = 0.05;

export function flightStep(view: FlightView, goal: FlightGoal, alpha: number): FlightView & { arrived: boolean } {
  const goalDistance = goal.distance ?? view.distance;
  const x = view.x + (goal.x - view.x) * alpha;
  const z = view.z + (goal.z - view.z) * alpha;
  const distance = view.distance + (goalDistance - view.distance) * alpha;
  const arrived =
    Math.hypot(goal.x - x, goal.z - z) < ARRIVE_FOCUS && Math.abs(goalDistance - distance) < ARRIVE_DISTANCE;
  return { x, z, distance, arrived };
}

/** The share of the way the full flight moves each frame. */
export const FLIGHT_ALPHA = 0.08;
/** Under reduced motion, a short hop glides this much faster: a few frames, no sweep (#229). */
export const REDUCED_GLIDE_ALPHA = 0.3;
/** The farthest hop, in world units (about a hex), that still glides under reduced motion. */
export const REDUCED_GLIDE_REACH = 1.5;
/** The largest change of zoom, as a ratio of distances, that still glides under reduced motion. */
const REDUCED_GLIDE_ZOOM = 1.25;

export type FlightStyle = { readonly kind: "glide"; readonly alpha: number } | { readonly kind: "cut" };

/**
 * How the camera gets from `view` to `goal` (#229). Normally the full eased
 * flight. Under reduced motion there is no sweep across the sea: a short hop
 * with little zoom glides quickly, anything more cuts straight there (the
 * board softens the cut with a brief fade).
 */
export function flightStyle(view: FlightView, goal: FlightGoal, reducedMotion: boolean): FlightStyle {
  if (!reducedMotion) return { kind: "glide", alpha: FLIGHT_ALPHA };
  const goalDistance = goal.distance ?? view.distance;
  const hop = Math.hypot(goal.x - view.x, goal.z - view.z);
  const zoom = Math.max(goalDistance, view.distance) / Math.max(1e-6, Math.min(goalDistance, view.distance));
  return hop <= REDUCED_GLIDE_REACH && zoom <= REDUCED_GLIDE_ZOOM
    ? { kind: "glide", alpha: REDUCED_GLIDE_ALPHA }
    : { kind: "cut" };
}
