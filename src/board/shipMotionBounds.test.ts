/**
 * How far off the hex-to-hex line a ship sails, pinned so the course cannot
 * drift back into long detours. Each case is simulated frame by frame with
 * shipMotion.ts and measured against the polyline through the hex centres:
 * the length sailed over the polyline's length, the greatest distance off
 * it (in hex widths, centre to centre), and how far the bow is off the
 * course while the ship makes way (a ship crabbing sideways, or spinning,
 * reads as a detour too).
 */
import { describe, expect, it } from "vitest";
import { HEX_STEP, angleDelta, restingMotion, setCourse, stepMotion, type OpenWater, type Point, type ShipMotion } from "./shipMotion";

const FRAME = 1 / 60;
const toward = (from: Point, degrees: number, hexes = 1): Point => {
  const h = (degrees * Math.PI) / 180;
  return [from[0] + Math.sin(h) * HEX_STEP * hexes, from[1] + Math.cos(h) * HEX_STEP * hexes];
};

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

interface Measure {
  /** Length sailed over the length of the polyline through the hexes. */
  ratio: number;
  /** Greatest distance off that polyline, in hex widths. */
  deviation: number;
  /** Greatest angle (degrees) between bow and course while making more than 1 world unit per second. */
  bowOff: number;
  /** Seconds until it comes to rest. */
  seconds: number;
}

/**
 * Sails from rest at `start` facing `heading` (degrees), setting each course
 * `[frame, waypoints]` as its frame comes round, until it is at rest.
 */
function measure(start: Point, heading: number, courses: [number, Point[]][], openWater?: OpenWater): Measure {
  let m: ShipMotion = restingMotion(start[0], start[1], (heading * Math.PI) / 180);
  const poly: Point[] = [start, ...courses.flatMap(([, w]) => w)];
  const polyLength = poly.slice(1).reduce((sum, b, i) => sum + Math.hypot(b[0] - poly[i][0], b[1] - poly[i][1]), 0);
  const lastCourse = Math.max(...courses.map(([f]) => f));
  let sailed = 0;
  let deviation = 0;
  let bowOff = 0;
  let frames = 0;
  for (let f = 0; f < 600 && (f <= lastCourse || m.voyage); f++) {
    for (const [at, waypoints] of courses) if (at === f) m = setCourse(m, waypoints, Infinity, openWater);
    const next = stepMotion(m, FRAME, false);
    sailed += Math.hypot(next.x - m.x, next.z - m.z);
    const p: Point = [next.x, next.z];
    deviation = Math.max(deviation, Math.min(...poly.slice(1).map((b, i) => segmentDistance(p, poly[i], b))));
    if (next.speed > 1) bowOff = Math.max(bowOff, (Math.abs(angleDelta(next.heading, next.course)) * 180) / Math.PI);
    m = next;
    frames = f + 1;
  }
  return { ratio: sailed / polyLength, deviation: deviation / HEX_STEP, bowOff, seconds: frames * FRAME };
}

const O: Point = [0, 0];
const A = toward(O, 0);
/** Water everywhere but a shore along x = 0.1, to starboard of a ship heading north. */
const shoreToStarboard: OpenWater = (x) => x < 0.1;

/** [case, measure, longest ratio, widest deviation (hex widths), largest bow-off (°), most seconds]. */
const CASES: [string, () => Measure, number, number, number, number][] = [
  ["from rest, next hex dead ahead", () => measure(O, 0, [[0, [A]]]), 1.01, 0.01, 1, 0.7],
  ["from rest, next hex 60° off the bow", () => measure(O, 0, [[0, [toward(O, 60)]]]), 1.25, 0.3, 40, 1],
  ["from rest, next hex 120° off the bow", () => measure(O, 0, [[0, [toward(O, 120)]]]), 1.25, 0.3, 45, 1.2],
  ["from rest, next hex dead astern", () => measure(O, 0, [[0, [toward(O, 180)]]]), 1.6, 0.3, 45, 1.4],
  ["from a spawn heading, first hex 165° off", () => measure(O, 0, [[0, [toward(O, 165)]]]), 1.6, 0.3, 45, 1.4],
  ["under way, next hex bends 60°", () => measure(O, 0, [[0, [A]], [18, [toward(A, 60)]]]), 1.25, 0.3, 40, 1.8],
  ["under way, next hex bends 120°", () => measure(O, 0, [[0, [A]], [18, [toward(A, 120)]]]), 1.25, 0.3, 40, 2.4],
  ["under way, sent back where it came from", () => measure(O, 0, [[0, [A]], [18, [O]]]), 1.6, 0.3, 45, 2.8],
  ["just arriving, sent back where it came from", () => measure(O, 0, [[0, [A]], [30, [O]]]), 1.6, 0.3, 45, 2.8],
  ["just arriving, sent back, shore to starboard", () => measure(O, 0, [[0, [A]], [30, [O]]], shoreToStarboard), 1.6, 0.3, 45, 2.8],
  [
    "three hexes chained with a 120° bend",
    () => measure(O, 0, [[0, [A]], [3, [toward(A, 120)]], [6, [toward(toward(A, 120), 120)]]]),
    1.25,
    0.3,
    40,
    2.6,
  ],
  ["an NPC's three-hex route, first leg dead astern", () => measure(O, 180, [[0, [A, toward(A, 60), toward(toward(A, 60), 60)]]]), 1.25, 0.3, 40, 2.4],
];

describe("a ship's course stays close to the hexes it sails through", () => {
  for (const [name, run, maxRatio, maxDeviation, maxBowOff, maxSeconds] of CASES) {
    it(name, () => {
      const { ratio, deviation, bowOff, seconds } = run();
      expect(ratio, "length sailed / straight hex-to-hex length").toBeLessThanOrEqual(maxRatio);
      expect(deviation, "furthest off the hex line, hex widths").toBeLessThanOrEqual(maxDeviation);
      expect(bowOff, "bow off the course while making way, degrees").toBeLessThanOrEqual(maxBowOff);
      expect(seconds, "seconds to rest").toBeLessThanOrEqual(maxSeconds);
    });
  }
});
