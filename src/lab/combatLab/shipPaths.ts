/**
 * PROTOTYPE (combat animation lab, PRD #259): the courses ships sail in the
 * matchup beats, as pure curves a beat samples at its progress `t` in [0, 1].
 *
 * World XZ, the board's convention (Ship.tsx): a heading `h` points the bow
 * along (sin h, cos h); starboard is (-cos h, sin h). A path is a chain of
 * cubic Béziers, walked by chord length, so its speed stays even across the
 * joins; the heading is the tangent, the heel follows the curvature.
 */

export type Point = readonly [number, number];
type Bezier = readonly [Point, Point, Point, Point];

/** Where a ship is and which way it points. */
export interface ShipPose {
  x: number;
  z: number;
  heading: number;
}

/** A pose on a path, with the heel its turn gives it (roll, radians; positive lifts the port side). */
export interface PathPose extends ShipPose {
  heel: number;
}

export interface ShipPath {
  readonly segments: readonly Bezier[];
  /** Each segment's share of the path's length, summed: the last is 1. */
  readonly ends: readonly number[];
}

/** Heel per unit of curvature (1/world unit) and its cap: a stylised lean, not a physical one. */
export const HEEL_PER_CURVATURE = 0.05;
export const MAX_HEEL = 0.14;

export const forward = (heading: number): Point => [Math.sin(heading), Math.cos(heading)];
export const starboard = (heading: number): Point => [-Math.cos(heading), Math.sin(heading)];
/** The heading that runs dead downwind, for a wind blowing toward `toward` (unit world XZ). */
export const downwindHeading = (toward: Point): number => Math.atan2(toward[0], toward[1]);

const add = (a: Point, b: Point, k = 1): Point => [a[0] + b[0] * k, a[1] + b[1] * k];
const posOf = (p: ShipPose): Point => [p.x, p.z];

function bezier(c: Bezier, t: number): Point {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
}

function bezierD1(c: Bezier, t: number): Point {
  const u = 1 - t;
  const k0 = 3 * u * u, k1 = 6 * u * t, k2 = 3 * t * t;
  return [
    k0 * (c[1][0] - c[0][0]) + k1 * (c[2][0] - c[1][0]) + k2 * (c[3][0] - c[2][0]),
    k0 * (c[1][1] - c[0][1]) + k1 * (c[2][1] - c[1][1]) + k2 * (c[3][1] - c[2][1]),
  ];
}

function bezierD2(c: Bezier, t: number): Point {
  const u = 1 - t;
  return [
    6 * u * (c[2][0] - 2 * c[1][0] + c[0][0]) + 6 * t * (c[3][0] - 2 * c[2][0] + c[1][0]),
    6 * u * (c[2][1] - 2 * c[1][1] + c[0][1]) + 6 * t * (c[3][1] - 2 * c[2][1] + c[1][1]),
  ];
}

function bezierLength(c: Bezier): number {
  let length = 0;
  let prev = c[0];
  for (let i = 1; i <= 24; i++) {
    const p = bezier(c, i / 24);
    length += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return length;
}

export function chainPath(segments: readonly Bezier[]): ShipPath {
  const lengths = segments.map(bezierLength);
  const total = lengths.reduce((s, l) => s + l, 0) || 1;
  let sum = 0;
  return { segments, ends: lengths.map((l) => (sum += l) / total) };
}

/** A straight run from `from` to `to`. */
export function straightPath(from: Point, to: Point): ShipPath {
  const third = (k: number): Point => [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
  return chainPath([[from, third(1 / 3), third(2 / 3), to]]);
}

/** The pose at share `t` of the path's length. */
export function pathPose(path: ShipPath, t: number): PathPose {
  const s = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < path.ends.length - 1 && s > path.ends[i]) i++;
  const start = i === 0 ? 0 : path.ends[i - 1];
  const local = path.ends[i] > start ? (s - start) / (path.ends[i] - start) : 0;
  const c = path.segments[i];
  const [x, z] = bezier(c, local);
  const d1 = bezierD1(c, local);
  const d2 = bezierD2(c, local);
  const speed = Math.hypot(d1[0], d1[1]);
  const curvature = speed > 1e-9 ? (d1[0] * d2[1] - d1[1] * d2[0]) / (speed * speed * speed) : 0;
  const heel = Math.max(-MAX_HEEL, Math.min(MAX_HEEL, HEEL_PER_CURVATURE * curvature));
  return { x, z, heading: Math.atan2(d1[0], d1[1]), heel };
}

/** Which beam of `ship` `other` lies on: 1 for starboard, -1 for port. */
export function sideOf(ship: ShipPose, other: { x: number; z: number }): 1 | -1 {
  const [sx, sz] = starboard(ship.heading);
  return (other.x - ship.x) * sx + (other.z - ship.z) * sz >= 0 ? 1 : -1;
}

export interface MatchupPaths {
  attacker: ShipPath;
  defender: ShipPath;
}

/**
 * Raking: the attacker swings across the defender's stern, square to its
 * keel at `fireAt` (when its broadside bears down the defender's length),
 * and comes out on the defender's other side. The defender holds its course.
 */
export function rakePath(
  attacker: ShipPose,
  defender: ShipPose,
  { attackerLength, defenderLength }: { attackerLength: number; defenderLength: number }
): MatchupPaths & { fireAt: number } {
  const fD = forward(defender.heading);
  const sD = starboard(defender.heading);
  // Across the stern, from the attacker's side of the defender to the other.
  const from = sideOf(defender, attacker);
  const across: Point = [-from * sD[0], -from * sD[1]];
  const clearance = 0.3 + 0.3 * attackerLength;
  const stern = add(posOf(defender), fD, -(defenderLength / 2 + clearance));
  const end = add(add(stern, across, 1.3), fD, -0.3);
  const a0 = posOf(attacker);
  const approach: Bezier = [a0, add(a0, forward(attacker.heading), 0.7), add(stern, across, -0.7), stern];
  const exit: Bezier = [stern, add(stern, across, 0.5), add(end, across, -0.5), end];
  const path = chainPath([approach, exit]);
  return { attacker: path, defender: straightPath(posOf(defender), add(posOf(defender), fD, 0.4)), fireAt: path.ends[0] };
}

/**
 * Closing in: the attacker comes alongside the defender, on the side it came
 * from, parallel and `gap` clear of it, as the defender sails on a little.
 */
export function closeInPath(
  attacker: ShipPose,
  defender: ShipPose,
  { attackerBeam, defenderBeam, gap }: { attackerBeam: number; defenderBeam: number; gap: number }
): MatchupPaths {
  const fD = forward(defender.heading);
  const sD = starboard(defender.heading);
  const side = sideOf(defender, attacker);
  const d1 = add(posOf(defender), fD, 0.35);
  const end = add(d1, sD, side * (attackerBeam / 2 + defenderBeam / 2 + gap));
  const a0 = posOf(attacker);
  return {
    attacker: chainPath([[a0, add(a0, forward(attacker.heading), 0.6), add(end, fD, -0.6), end]]),
    defender: straightPath(posOf(defender), d1),
  };
}

/** Bearing away: the ship turns to run dead downwind, all sail full, and runs off. */
export function bearAwayPath(ship: ShipPose, toward: Point): ShipPath {
  const run = forward(downwindHeading(toward));
  const p0 = posOf(ship);
  const end = add(p0, run, 2.4);
  return chainPath([[p0, add(p0, forward(ship.heading), 0.5), add(end, run, -1.0), end]]);
}
