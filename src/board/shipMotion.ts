/**
 * How a ship sails from hex to hex (#212): one smooth curve through the hex
 * centres of its move, eased over the whole move, the bow following the
 * curve at a limited turn rate, heeling into turns. Pure, no Three.js:
 * `Ship.tsx` keeps a `ShipMotion` per ship, sets a course when the ship's hex
 * changes and steps it each frame.
 *
 * - **The path** is a chain of cubic Hermite segments through the waypoints.
 *   It leaves along the way the ship is already sailing (or pointing, at
 *   rest); at each interior waypoint its tangent bisects the legs in and
 *   out, so the curve is tangent-continuous; it arrives along its last leg.
 *   A first waypoint well behind the bow gets a turning point ahead and to
 *   the side, so the ship comes about in an arc instead of pivoting. Given
 *   where the open water is (`OpenWater`), it turns to the side whose arc
 *   stays over water, and tightens the arc when both sides are near land.
 * - **Distance along the path** follows a cubic in time over the whole move:
 *   from the speed the ship already has (0 at rest) to rest at the end, so
 *   it gathers way, glides and settles; a new course mid-move keeps its way.
 * - **The duration** grows with the path's length, so one hex is brisk and a
 *   long move is not rushed.
 * - **The heading** turns toward the path's tangent at no more than
 *   `MAX_TURN_RATE`.
 * - **Heel and pitch** add to the wave pose (shipWavePose.ts), never replace
 *   it: a roll toward the outside of a turn from speed × yaw rate and a
 *   slight bow-down pitch as it gathers way, clamped to a few degrees and
 *   eased. None under reduced motion.
 *
 * Positions are world xz in whatever frame the caller keeps the ship in;
 * `setCourse` unwraps waypoints the short way round a wrapping map and moves
 * the whole motion by whole wrap widths so the destination lands where the
 * caller asked (its canonical copy).
 */

export type Point = readonly [number, number];

/** Whether a hull can sail at world (x, z): open water clear of the shore. */
export type OpenWater = (x: number, z: number) => boolean;

interface Segment {
  p0: Point;
  p1: Point;
  m0: Point;
  m1: Point;
}

export interface ShipPath {
  segments: readonly Segment[];
  /** Global curve parameter (segment index + local t) and distance from the start, sampled. */
  params: readonly number[];
  distances: readonly number[];
  length: number;
}

export interface ShipVoyage {
  path: ShipPath;
  /** The waypoints the caller asked for (no turning points), and each one's distance along the path. */
  waypoints: readonly Point[];
  waypointDistances: readonly number[];
  /** Seconds the voyage takes, and seconds sailed. */
  duration: number;
  elapsed: number;
  /** Speed along the path when the voyage began (world units per second). */
  startSpeed: number;
  /**
   * The come-about's turning point and its distance along the path, if the
   * voyage has one: a new course set before the ship reaches it keeps it,
   * so hexes sent one after another while coming about make one turn (#213).
   */
  turn?: { readonly point: Point; readonly distance: number } | null;
}

export interface ShipMotion {
  x: number;
  z: number;
  /** The bow's heading (atan2(dx, dz), unbounded so it never jumps). */
  heading: number;
  /** The path's direction where the ship is (the course it is making good). */
  course: number;
  /** Speed along the path, world units per second. */
  speed: number;
  /** Heading's rate of change, radians per second (positive turns toward local +X). */
  yawRate: number;
  /** Extra roll (local +X side up) and pitch (bow up), radians, on top of the wave pose. */
  roll: number;
  pitch: number;
  voyage: ShipVoyage | null;
}

/** World units between neighbouring hex centres (hex.ts, SIZE 1). */
export const HEX_STEP = Math.sqrt(3);
/** Seconds any move takes at least, and seconds more per world unit of path. */
export const VOYAGE_BASE_SECONDS = 0.3;
export const VOYAGE_SECONDS_PER_UNIT = 0.17;
/** The longest a single move may take, however far it goes. */
export const VOYAGE_MAX_SECONDS = 2.2;
/** Fastest the bow swings round, radians per second (about 200°/s). */
export const MAX_TURN_RATE = 3.5;
/** Radians of heel per (world unit/s × radian/s) of speed × yaw rate, and its cap (6°). */
export const HEEL_GAIN = 0.006;
export const MAX_HEEL = (6 * Math.PI) / 180;
/** Radians of bow-down pitch per world unit/s² of acceleration, and its cap (2°). */
export const PITCH_GAIN = 0.0015;
export const MAX_PITCH = (2 * Math.PI) / 180;
/** Seconds the heel and pitch take to follow (first-order lag): a hull has inertia. */
export const LEAN_RESPONSE_SECONDS = 0.25;
/** A first leg more than this far (radians) off the bow comes about through a turning point. */
export const COME_ABOUT_ANGLE = (110 * Math.PI) / 180;
/** Where that turning point sits from the start, world units: ahead along the bow, and to the side. */
export const COME_ABOUT_AHEAD = 0.45;
export const COME_ABOUT_SIDE = 0.6;
/** The sizes a come-about arc tries, largest first, as shares of COME_ABOUT_AHEAD and COME_ABOUT_SIDE. */
export const COME_ABOUT_SCALES: readonly number[] = [1, 0.75, 0.5, 0.3];
/** World units between the points of a come-about arc checked against the open water. */
const COME_ABOUT_CHECK_STEP = 0.08;
/** Waypoints closer than this ahead of the ship are counted as passed when a new course is set. */
export const WAYPOINT_PASSED = 0.25;

const SAMPLES_PER_SEGMENT = 24;
const EPSILON = 1e-6;

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const scale = (a: Point, k: number): Point => [a[0] * k, a[1] * k];
const len = (a: Point): number => Math.hypot(a[0], a[1]);
const unit = (a: Point): Point => {
  const l = len(a);
  return l > EPSILON ? [a[0] / l, a[1] / l] : [0, 0];
};
/** The unit direction of a heading (atan2(dx, dz)): (sin h, cos h). */
export const headingDirection = (heading: number): Point => [Math.sin(heading), Math.cos(heading)];
/** The heading of a direction in xz. */
export const directionHeading = (d: Point): number => Math.atan2(d[0], d[1]);
/** `angle` minus `reference`, wrapped into (−π, π]. */
export const angleDelta = (angle: number, reference: number): number => {
  const d = (angle - reference) % (2 * Math.PI);
  return d > Math.PI ? d - 2 * Math.PI : d <= -Math.PI ? d + 2 * Math.PI : d;
};
/** The right-hand side of a heading: the hull's local +X, (cos h, −sin h). */
const starboard = (d: Point): Point => [d[1], -d[0]];

function hermite(s: Segment, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return [
    h00 * s.p0[0] + h10 * s.m0[0] + h01 * s.p1[0] + h11 * s.m1[0],
    h00 * s.p0[1] + h10 * s.m0[1] + h01 * s.p1[1] + h11 * s.m1[1],
  ];
}

function hermiteDerivative(s: Segment, t: number): Point {
  const t2 = t * t;
  const d00 = 6 * t2 - 6 * t;
  const d10 = 3 * t2 - 4 * t + 1;
  const d01 = -6 * t2 + 6 * t;
  const d11 = 3 * t2 - 2 * t;
  return [
    d00 * s.p0[0] + d10 * s.m0[0] + d01 * s.p1[0] + d11 * s.m1[0],
    d00 * s.p0[1] + d10 * s.m0[1] + d01 * s.p1[1] + d11 * s.m1[1],
  ];
}

/**
 * The knots a path from `start` facing `startHeading` runs through to reach
 * `waypoints`: the waypoints themselves, after a turning point when the
 * first is well behind the bow. Also says which knots are turning points.
 */
function pathKnots(
  start: Point,
  startHeading: number,
  waypoints: readonly Point[],
  openWater?: OpenWater
): { knots: Point[]; turning: boolean } {
  const knots: Point[] = [start];
  let turning = false;
  const first = waypoints[0];
  if (first) {
    const leg = sub(first, start);
    const off = Math.abs(angleDelta(directionHeading(leg), startHeading));
    if (len(leg) > EPSILON && off > COME_ABOUT_ANGLE) {
      knots.push(comeAboutPoint(start, startHeading, first, openWater));
      turning = true;
    }
  }
  for (const w of waypoints) {
    if (len(sub(w, knots[knots.length - 1])) > EPSILON) knots.push(w);
  }
  return { knots, turning };
}

/** The turning point `scale` of the full come-about size ahead of `start` and to `side` (+1 starboard, −1 port). */
function turningPoint(start: Point, startHeading: number, side: number, scale: number): Point {
  const bow = headingDirection(startHeading);
  const right = starboard(bow);
  return [
    start[0] + (bow[0] * COME_ABOUT_AHEAD + right[0] * side * COME_ABOUT_SIDE) * scale,
    start[1] + (bow[1] * COME_ABOUT_AHEAD + right[1] * side * COME_ABOUT_SIDE) * scale,
  ];
}

/** Share of the points along the come-about arc start → `turn` → `target` that are open water. */
function waterShare(start: Point, startHeading: number, turn: Point, target: Point, openWater: OpenWater): number {
  const arc = buildPathFromKnots([start, turn, target], startHeading, true);
  const steps = Math.max(2, Math.ceil(arc.length / COME_ABOUT_CHECK_STEP));
  let wet = 0;
  for (let k = 0; k <= steps; k++) {
    const [x, z] = pathPoint(arc, (k / steps) * arc.length);
    if (openWater(x, z)) wet++;
  }
  return wet / (steps + 1);
}

/**
 * Where a ship facing `startHeading` at `start` turns to come about toward
 * `target`, well behind its bow: ahead and to the side the target lies on
 * (starboard on a dead reversal). Given the open water, the largest arc on
 * either side (that side first) that stays over water; if none does, the
 * arc with the most water under it, the tighter on a tie.
 */
function comeAboutPoint(start: Point, startHeading: number, target: Point, openWater?: OpenWater): Point {
  const right = starboard(headingDirection(startHeading));
  const leg = sub(target, start);
  const preferred = leg[0] * right[0] + leg[1] * right[1] < -EPSILON ? -1 : 1;
  if (!openWater) return turningPoint(start, startHeading, preferred, 1);
  let best = { point: turningPoint(start, startHeading, preferred, 1), share: -1 };
  for (const scale of COME_ABOUT_SCALES) {
    for (const side of [preferred, -preferred]) {
      const point = turningPoint(start, startHeading, side, scale);
      const share = waterShare(start, startHeading, point, target, openWater);
      if (share >= 1) return point;
      // Later candidates are tighter, so a tie goes to them.
      if (share >= best.share) best = { point, share };
    }
  }
  return best.point;
}

/**
 * The direction of the path's tangent at interior knot `i`: the bisector of
 * the legs in and out, or (on a hairpin, where they cancel) square to the
 * leg in, to starboard.
 */
function knotDirection(knots: readonly Point[], i: number): Point {
  const inward = unit(sub(knots[i], knots[i - 1]));
  const outward = unit(sub(knots[i + 1], knots[i]));
  const sum: Point = [inward[0] + outward[0], inward[1] + outward[1]];
  return len(sum) > 0.2 ? unit(sum) : starboard(inward);
}

/** Samples a chain of segments into a distance table. */
function tabulate(segments: readonly Segment[]): ShipPath {
  const params: number[] = [0];
  const distances: number[] = [0];
  let total = 0;
  segments.forEach((segment, index) => {
    let prev = segment.p0;
    for (let k = 1; k <= SAMPLES_PER_SEGMENT; k++) {
      const t = k / SAMPLES_PER_SEGMENT;
      const p = hermite(segment, t);
      total += len(sub(p, prev));
      prev = p;
      params.push(index + t);
      distances.push(total);
    }
  });
  return { segments, params, distances, length: total };
}

/**
 * The smooth path from `start`, leaving along `startHeading`, through each of
 * `waypoints` in turn. A path with no waypoints (or only the start) has length 0.
 */
export function buildShipPath(start: Point, startHeading: number, waypoints: readonly Point[], openWater?: OpenWater): ShipPath {
  const { knots, turning } = pathKnots(start, startHeading, waypoints, openWater);
  return buildPathFromKnots(knots, startHeading, turning);
}

/**
 * The chain of segments through `knots`, leaving along `startHeading`. It
 * arrives along its last leg; when that leg starts from a turning point
 * (`turning`, a come-about straight to one waypoint), along the leg from the
 * start instead, so the ship settles facing the way it was sent, as the
 * board's record of its heading has it (shipHeading.ts).
 */
function buildPathFromKnots(knots: readonly Point[], startHeading: number, turning: boolean): ShipPath {
  const segments: Segment[] = [];
  const n = knots.length;
  for (let i = 0; i + 1 < n; i++) {
    const p0 = knots[i];
    const p1 = knots[i + 1];
    const chord = len(sub(p1, p0));
    const d0 = i === 0 ? headingDirection(startHeading) : knotDirection(knots, i);
    const arrival = turning && n === 3 ? sub(p1, knots[0]) : sub(p1, p0);
    const d1 = i + 1 === n - 1 ? unit(arrival) : knotDirection(knots, i + 1);
    segments.push({ p0, p1, m0: scale(d0, chord), m1: scale(d1, chord) });
  }
  return tabulate(segments);
}

/** Index of the last sample at or before distance `s` (binary search). */
function sampleIndex(path: ShipPath, s: number): number {
  const d = path.distances;
  let lo = 0;
  let hi = d.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (d[mid] <= s) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The curve parameter at distance `s` along the path. */
function paramAt(path: ShipPath, s: number): number {
  const clamped = Math.min(Math.max(s, 0), path.length);
  const i = sampleIndex(path, clamped);
  const j = Math.min(i + 1, path.distances.length - 1);
  const span = path.distances[j] - path.distances[i];
  const f = span > EPSILON ? (clamped - path.distances[i]) / span : 0;
  return path.params[i] + (path.params[j] - path.params[i]) * f;
}

const segmentAt = (path: ShipPath, param: number): { segment: Segment; t: number } => {
  const index = Math.min(Math.floor(param), path.segments.length - 1);
  return { segment: path.segments[index], t: param - index };
};

/** The point at distance `s` along the path (clamped to its ends). */
export function pathPoint(path: ShipPath, s: number): Point {
  if (path.segments.length === 0) return [0, 0];
  const { segment, t } = segmentAt(path, paramAt(path, s));
  return hermite(segment, t);
}

/** The heading of the path's tangent at distance `s` (clamped to its ends). */
export function pathHeading(path: ShipPath, s: number): number {
  if (path.segments.length === 0) return 0;
  const { segment, t } = segmentAt(path, paramAt(path, s));
  let d = hermiteDerivative(segment, t);
  // A cusp (zero derivative) borrows the chord's direction.
  if (len(d) < EPSILON) d = sub(segment.p1, segment.p0);
  return directionHeading(d);
}

/** How long a move along a path `length` world units long takes, seconds. */
export function voyageDuration(length: number): number {
  return Math.min(VOYAGE_BASE_SECONDS + VOYAGE_SECONDS_PER_UNIT * length, VOYAGE_MAX_SECONDS);
}

/**
 * Distance sailed and speed `elapsed` seconds into a voyage of `length` over
 * `duration` that began at `startSpeed`: a cubic from (0, startSpeed) to
 * (length, 0). At rest at the start it is smoothstep, eased over the whole move.
 */
export function voyageProgress(
  length: number,
  duration: number,
  startSpeed: number,
  elapsed: number
): { distance: number; speed: number } {
  if (duration <= 0 || length <= 0) return { distance: length, speed: 0 };
  const u = Math.min(Math.max(elapsed / duration, 0), 1);
  const carry = startSpeed * duration;
  const distance = length * (3 * u * u - 2 * u * u * u) + carry * (u - 2 * u * u + u * u * u);
  const speed = (length * (6 * u - 6 * u * u) + carry * (1 - 4 * u + 3 * u * u)) / duration;
  return { distance, speed: u >= 1 ? 0 : speed };
}

/**
 * The duration for a voyage of `length` begun at `startSpeed`: its own
 * length's duration, shortened if need be so the cubic never overshoots and
 * backs up (startSpeed × duration under 3 × length).
 */
export function voyageDurationFrom(length: number, startSpeed: number): number {
  const own = voyageDuration(length);
  return startSpeed > EPSILON ? Math.min(own, (2.5 * length) / startSpeed) : own;
}

/** `current` turned toward `target` by at most `maxStep` radians, the short way round. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const d = angleDelta(target, current);
  return current + Math.max(-maxStep, Math.min(maxStep, d));
}

/** The heel a ship makes at `speed` turning at `yawRate`: toward the outside of the turn, clamped. */
export function turnHeel(speed: number, yawRate: number): number {
  return Math.max(-MAX_HEEL, Math.min(MAX_HEEL, HEEL_GAIN * speed * yawRate));
}

/** The bow-down pitch (negative) of a ship gathering way at `acceleration`; none as it slows. */
export function gatheringPitch(acceleration: number): number {
  return -Math.min(MAX_PITCH, PITCH_GAIN * Math.max(acceleration, 0));
}

/** A ship at rest at (x, z), its bow along `heading`. */
export function restingMotion(x: number, z: number, heading: number): ShipMotion {
  return { x, z, heading, course: heading, speed: 0, yawRate: 0, roll: 0, pitch: 0, voyage: null };
}

/** `v` moved by whole `period`s so it lies within half a period of `reference`. */
const nearest = (v: number, reference: number, period: number): number =>
  Number.isFinite(period) ? v + period * Math.round((reference - v) / period) : v;

/**
 * A new course for `motion` through `waypoints` (world xz): the waypoints of
 * the voyage it is on that it has not yet reached come first, then these.
 * Each waypoint is taken the short way round a map `wrapWidth` wide from the
 * one before; the whole motion is then moved by whole wrap widths so the
 * last waypoint lands exactly where it was given. Keeps the ship's way.
 * `openWater`, if given, steers a come-about clear of the shore; it is
 * asked about points in the frame the last waypoint was given in.
 */
export function setCourse(
  motion: ShipMotion,
  waypoints: readonly Point[],
  wrapWidth: number = Infinity,
  openWater?: OpenWater
): ShipMotion {
  if (waypoints.length === 0) return motion;
  const pending: Point[] = [];
  const voyage = motion.voyage;
  // A come-about under way and not yet past its turning point goes on through it
  let keptTurn = false;
  if (voyage) {
    const sailed = voyageProgress(voyage.path.length, voyage.duration, voyage.startSpeed, voyage.elapsed).distance;
    if (voyage.turn && voyage.turn.distance > sailed + WAYPOINT_PASSED) {
      pending.push(voyage.turn.point);
      keptTurn = true;
    }
    voyage.waypoints.forEach((w, i) => {
      if (voyage.waypointDistances[i] > sailed + WAYPOINT_PASSED) pending.push(w);
    });
  }
  // Unwrap every waypoint onto the ship's frame, each the short way from the last.
  const route: Point[] = [];
  let ref: Point = [motion.x, motion.z];
  for (const w of [...pending, ...waypoints]) {
    const p: Point = [nearest(w[0], ref[0], wrapWidth), w[1]];
    route.push(p);
    ref = p;
  }
  const last = waypoints[waypoints.length - 1];
  const shift = last[0] - route[route.length - 1][0];
  const start: Point = [motion.x + shift, motion.z];
  const shifted = route.map((p): Point => [p[0] + shift, p[1]]);
  // Leave along the course it is making, or at rest along its bow.
  const startHeading = voyage && motion.speed > EPSILON ? motion.course : motion.heading;
  const { knots, turning } = keptTurn ? { knots: [start, ...shifted], turning: true } : pathKnots(start, startHeading, shifted, openWater);
  if (knots.length < 2) return { ...motion, x: start[0], voyage: null };
  const path = buildPathFromKnots(knots, startHeading, turning);
  // Distances of the asked-for waypoints: every knot after the start, less the turning point.
  const realKnotIndices = knots.map((_, i) => i).filter((i) => i > 0 && !(turning && i === 1));
  const waypointDistances = realKnotIndices.map((i) => path.distances[Math.min(i * SAMPLES_PER_SEGMENT, path.distances.length - 1)]);
  const startSpeed = voyage ? motion.speed : 0;
  return {
    ...motion,
    x: start[0],
    voyage: {
      path,
      waypoints: realKnotIndices.map((i) => knots[i]),
      waypointDistances,
      duration: voyageDurationFrom(path.length, startSpeed),
      elapsed: 0,
      startSpeed,
      turn: turning ? { point: knots[1], distance: path.distances[Math.min(SAMPLES_PER_SEGMENT, path.distances.length - 1)] } : null,
    },
  };
}

/**
 * `motion` advanced `dt` seconds: along its voyage if it has one (ending it
 * at its last waypoint), the bow turned toward the course at no more than
 * MAX_TURN_RATE, the heel and pitch eased toward what the turn and the way
 * it gathers ask for (held at 0 under `reducedMotion`).
 */
export function stepMotion(motion: ShipMotion, dt: number, reducedMotion: boolean): ShipMotion {
  if (dt <= 0) return motion;
  let { x, z, course, speed, voyage } = motion;
  if (voyage) {
    const elapsed = voyage.elapsed + dt;
    const { distance, speed: nextSpeed } = voyageProgress(voyage.path.length, voyage.duration, voyage.startSpeed, elapsed);
    [x, z] = pathPoint(voyage.path, distance);
    course = pathHeading(voyage.path, distance);
    speed = nextSpeed;
    voyage = elapsed >= voyage.duration ? null : { ...voyage, elapsed };
  }
  const acceleration = (speed - motion.speed) / dt;
  const heading = turnToward(motion.heading, course, MAX_TURN_RATE * dt);
  const yawRate = (heading - motion.heading) / dt;
  const follow = 1 - Math.exp(-dt / LEAN_RESPONSE_SECONDS);
  const rollTarget = reducedMotion ? 0 : turnHeel(speed, yawRate);
  const pitchTarget = reducedMotion ? 0 : gatheringPitch(acceleration);
  const roll = reducedMotion ? 0 : motion.roll + (rollTarget - motion.roll) * follow;
  const pitch = reducedMotion ? 0 : motion.pitch + (pitchTarget - motion.pitch) * follow;
  return { x, z, heading, course, speed, yawRate, roll, pitch, voyage };
}
