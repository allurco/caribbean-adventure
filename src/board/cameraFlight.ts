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
