import { describe, expect, it } from "vitest";
import {
  HEX_STEP,
  MAX_HEEL,
  MAX_PITCH,
  MAX_TURN_RATE,
  SLOW_TURN_SPEED,
  VOYAGE_MAX_SECONDS,
  angleDelta,
  buildShipPath,
  directionHeading,
  gatheringPitch,
  pathHeading,
  pathPoint,
  restingMotion,
  setCourse,
  stepMotion,
  turnHeel,
  turnRate,
  turnToward,
  voyageDuration,
  voyageDurationFrom,
  voyageProgress,
  type OpenWater,
  type Point,
  type ShipMotion,
} from "./shipMotion";

const FRAME = 1 / 60;
const close = (a: Point, b: Point, eps = 1e-3) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;
/** Heading toward +x (atan2(1, 0)). */
const EAST = Math.PI / 2;

/** Steps `motion` frame by frame until its voyage ends (or `maxSeconds`), recording every frame. */
function sail(motion: ShipMotion, reducedMotion = false, maxSeconds = 5): ShipMotion[] {
  const frames: ShipMotion[] = [motion];
  let m = motion;
  for (let t = 0; t < maxSeconds && m.voyage; t += FRAME) {
    m = stepMotion(m, FRAME, reducedMotion);
    frames.push(m);
  }
  return frames;
}

describe("buildShipPath", () => {
  it("runs through every waypoint and ends on the last", () => {
    const waypoints: Point[] = [[HEX_STEP, 0], [HEX_STEP * 2, 1], [HEX_STEP * 3, 0]];
    const path = buildShipPath([0, 0], EAST, waypoints);
    expect(close(pathPoint(path, 0), [0, 0])).toBe(true);
    expect(close(pathPoint(path, path.length), waypoints[2])).toBe(true);
    for (const w of waypoints) {
      let best = Infinity;
      for (let s = 0; s <= path.length; s += 0.01) {
        const p = pathPoint(path, s);
        best = Math.min(best, Math.hypot(p[0] - w[0], p[1] - w[1]));
      }
      expect(best).toBeLessThan(0.02);
    }
  });

  it("leaves along the start heading", () => {
    const north = 0;
    const path = buildShipPath([0, 0], north, [[HEX_STEP, HEX_STEP]]);
    expect(Math.abs(angleDelta(pathHeading(path, 0), north))).toBeLessThan(1e-3);
  });

  it("is tangent-continuous: the heading never jumps along a path with corners", () => {
    // A zig-zag through hex centres: 60° corners at each.
    const waypoints: Point[] = [[1.5, 0.866], [3, 0], [4.5, 0.866], [6, 0]];
    const path = buildShipPath([0, 0], directionHeading([1.5, 0.866]), waypoints);
    let prev = pathHeading(path, 0);
    for (let s = 0.01; s <= path.length; s += 0.01) {
      const h = pathHeading(path, s);
      expect(Math.abs(angleDelta(h, prev))).toBeLessThan(0.1);
      prev = h;
    }
  });

  it("is about as long as the straight line for a straight move", () => {
    const path = buildShipPath([0, 0], EAST, [[HEX_STEP, 0]]);
    expect(path.length).toBeCloseTo(HEX_STEP, 3);
  });

  it("comes about in an arc when the waypoint is dead astern, never pivoting on the spot", () => {
    const path = buildShipPath([0, 0], EAST, [[-HEX_STEP, 0]]);
    let maxSide = 0;
    let maxAhead = 0;
    for (let s = 0; s <= path.length; s += 0.01) {
      const [x, z] = pathPoint(path, s);
      maxSide = Math.max(maxSide, Math.abs(z));
      maxAhead = Math.max(maxAhead, x);
    }
    expect(maxAhead).toBeGreaterThan(0.1); // it sails on before it turns
    expect(maxSide).toBeGreaterThan(0.15); // it swings out to the side
    expect(maxSide).toBeLessThan(HEX_STEP / 2); // within its own hex
    // ...and the tangent swings round smoothly the whole way.
    let prev = pathHeading(path, 0);
    for (let s = 0.01; s <= path.length; s += 0.01) {
      const h = pathHeading(path, s);
      expect(Math.abs(angleDelta(h, prev))).toBeLessThan(0.25);
      prev = h;
    }
    expect(close(pathPoint(path, path.length), [-HEX_STEP, 0])).toBe(true);
  });
});

describe("voyage timing", () => {
  it("takes longer for longer paths, never more than the cap", () => {
    const one = voyageDuration(HEX_STEP);
    const three = voyageDuration(3 * HEX_STEP);
    expect(one).toBeGreaterThan(0.4);
    expect(one).toBeLessThan(0.75);
    expect(three).toBeGreaterThan(one);
    expect(three).toBeLessThan(3 * one); // long moves are not three times as slow
    expect(voyageDuration(100)).toBe(VOYAGE_MAX_SECONDS);
  });

  it("eases in and out over the whole move from rest", () => {
    const L = 3 * HEX_STEP;
    const T = voyageDuration(L);
    expect(voyageProgress(L, T, 0, 0)).toEqual({ distance: 0, speed: 0 });
    const mid = voyageProgress(L, T, 0, T / 2);
    expect(mid.distance).toBeCloseTo(L / 2, 6);
    expect(mid.speed).toBeCloseTo((1.5 * L) / T, 6);
    expect(voyageProgress(L, T, 0, T).distance).toBeCloseTo(L, 6);
    expect(voyageProgress(L, T, 0, T).speed).toBe(0);
    expect(voyageProgress(L, T, 0, T * 0.05).speed).toBeLessThan(mid.speed * 0.2);
    expect(voyageProgress(L, T, 0, T * 0.95).speed).toBeLessThan(mid.speed * 0.2);
  });

  it("keeps the way it has at the start of a new course, and never backs up", () => {
    const L = HEX_STEP;
    const v0 = 6;
    const T = voyageDurationFrom(L, v0);
    expect(voyageProgress(L, T, v0, 0).speed).toBeCloseTo(v0, 6);
    let prev = 0;
    for (let k = 1; k <= 100; k++) {
      const { distance } = voyageProgress(L, T, v0, (k / 100) * T);
      expect(distance).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(distance).toBeLessThanOrEqual(L + 1e-9);
      prev = distance;
    }
  });
});

describe("heading, heel and pitch helpers", () => {
  it("turns the short way round, by at most the step", () => {
    expect(turnToward(0, 1, 0.1)).toBeCloseTo(0.1);
    expect(turnToward(0, -1, 0.1)).toBeCloseTo(-0.1);
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1); // across ±π, not back through 0
    expect(turnToward(0, 0.05, 0.1)).toBeCloseTo(0.05);
  });

  it("heels toward the outside of the turn, a few degrees at most", () => {
    // Heading increasing turns toward local +X (starboard): the outside is port, so +X lifts (positive roll).
    expect(turnHeel(4, 2)).toBeGreaterThan(0);
    expect(turnHeel(4, -2)).toBeLessThan(0);
    expect(turnHeel(0, 3)).toBe(0);
    expect(turnHeel(100, 100)).toBe(MAX_HEEL);
    expect(MAX_HEEL).toBeLessThan((8 * Math.PI) / 180);
  });

  it("dips the bow as it gathers way, not as it slows", () => {
    expect(gatheringPitch(10)).toBeLessThan(0);
    expect(gatheringPitch(1e6)).toBe(-MAX_PITCH);
    expect(gatheringPitch(-10)).toBeCloseTo(0);
  });
});

describe("a ship sailing", () => {
  it("arrives exactly on its destination and comes to rest", () => {
    const frames = sail(setCourse(restingMotion(0, 0, EAST), [[HEX_STEP, 0]]));
    const end = frames[frames.length - 1];
    expect(end.voyage).toBeNull();
    expect(end.x).toBeCloseTo(HEX_STEP, 6);
    expect(end.z).toBeCloseTo(0, 6);
    expect(end.speed).toBe(0);
  });

  it("never turns faster than the turn rate for its speed, and the bow never jumps", () => {
    const frames = sail(setCourse(restingMotion(0, 0, EAST), [[-HEX_STEP, 0]]));
    for (let i = 1; i < frames.length; i++) {
      expect(Math.abs(frames[i].heading - frames[i - 1].heading)).toBeLessThanOrEqual(turnRate(frames[i].speed) * FRAME + 1e-9);
    }
    expect(turnRate(SLOW_TURN_SPEED)).toBe(MAX_TURN_RATE);
    // It has come about by the end of a reversal: its bow on the course it arrived on, the way it was sent.
    let m = frames[frames.length - 1];
    for (let k = 0; k < 120; k++) m = stepMotion(m, FRAME, false);
    expect(Math.abs(angleDelta(m.heading, m.course))).toBeLessThan(1e-6);
    expect(Math.abs(angleDelta(m.heading, -EAST))).toBeLessThan(1e-3);
  });

  it("moves a short way each frame: nothing jumps", () => {
    const frames = sail(setCourse(restingMotion(0, 0, 0), [[1.5, 0.866], [3, 0], [3, 1.732]]));
    for (let i = 1; i < frames.length; i++) {
      const step = Math.hypot(frames[i].x - frames[i - 1].x, frames[i].z - frames[i - 1].z);
      expect(step).toBeLessThan(0.2);
    }
  });

  it("heels into a turn and comes upright on a straight run", () => {
    const turning = sail(setCourse(restingMotion(0, 0, 0), [[1.5, 0.866], [3, 0]]));
    const maxRoll = Math.max(...turning.map((m) => Math.abs(m.roll)));
    expect(maxRoll).toBeGreaterThan(0.005);
    expect(maxRoll).toBeLessThanOrEqual(MAX_HEEL);
    const straight = sail(setCourse(restingMotion(0, 0, EAST), [[HEX_STEP, 0], [2 * HEX_STEP, 0]]));
    expect(Math.max(...straight.map((m) => Math.abs(m.roll)))).toBeLessThan(1e-6);
    // Bow down while gathering way.
    expect(Math.min(...straight.slice(0, 15).map((m) => m.pitch))).toBeLessThan(0);
  });

  it("does not heel or pitch under reduced motion", () => {
    const frames = sail(setCourse(restingMotion(0, 0, 0), [[1.5, 0.866], [3, 0]]), true);
    for (const m of frames) {
      expect(m.roll).toBe(0);
      expect(m.pitch).toBe(0);
    }
    expect(frames[frames.length - 1].x).toBeCloseTo(3, 6);
  });

  it("keeps its way and runs through the hex it was making for when given a new one mid-move", () => {
    let m = setCourse(restingMotion(0, 0, EAST), [[HEX_STEP, 0]]);
    for (let k = 0; k < 12; k++) m = stepMotion(m, FRAME, false);
    const speed = m.speed;
    expect(speed).toBeGreaterThan(0);
    m = setCourse(m, [[1.5 * HEX_STEP, 1.5]]);
    expect(m.speed).toBe(speed);
    const frames = sail(m);
    // It passed by its first destination without stopping there.
    const gaps = frames.map((f) => Math.hypot(f.x - HEX_STEP, f.z));
    const nearest = gaps.indexOf(Math.min(...gaps));
    expect(gaps[nearest]).toBeLessThan(0.05);
    expect(frames[nearest].speed).toBeGreaterThan(1);
    const end = frames[frames.length - 1];
    expect(end.x).toBeCloseTo(1.5 * HEX_STEP, 6);
    expect(end.z).toBeCloseTo(1.5, 6);
  });

  it("sails hexes that arrive one after another as one continuous move, easing to rest only after the last", () => {
    // Three one-hex moves (a route the client sends hex by hex), each arriving while the ship is under way.
    const hexes: Point[] = [[1.5, 0.866], [3, 0], [4.5, 0.866]];
    let m = setCourse(restingMotion(0, 0, directionHeading(hexes[0])), [hexes[0]]);
    const frames: ShipMotion[] = [m];
    for (let k = 1; k < 3; k++) {
      for (let f = 0; f < 9; f++) frames.push((m = stepMotion(m, FRAME, false)));
      m = setCourse(m, [hexes[k]]);
    }
    frames.push(...sail(m).slice(1));
    // Never stops between hexes: once under way, the speed only falls to rest at the very end.
    const underWay = frames.findIndex((f) => f.speed > 1);
    const settling = frames.length - 8;
    for (let i = underWay; i < settling; i++) expect(frames[i].speed).toBeGreaterThan(0.5);
    // The bow never snaps.
    for (let i = 1; i < frames.length; i++) {
      expect(Math.abs(frames[i].heading - frames[i - 1].heading)).toBeLessThanOrEqual(turnRate(frames[i].speed) * FRAME + 1e-9);
    }
    // It passes by every hex and ends on the last.
    for (const [hx, hz] of hexes) expect(Math.min(...frames.map((f) => Math.hypot(f.x - hx, f.z - hz)))).toBeLessThan(0.3);
    const end = frames[frames.length - 1];
    expect(end.x).toBeCloseTo(4.5, 6);
    expect(end.z).toBeCloseTo(0.866, 6);
  });

  it("crosses a wrap seam the short way and lands on the canonical destination", () => {
    const W = 30;
    const m = setCourse(restingMotion(W - 0.5, 0, EAST), [[1, 0]], W);
    // The motion is moved one wrap width west, so it sails east over the seam.
    expect(m.x).toBeCloseTo(-0.5, 6);
    const frames = sail(m);
    for (let i = 1; i < frames.length; i++) expect(frames[i].x).toBeGreaterThanOrEqual(frames[i - 1].x - 1e-9);
    expect(frames[frames.length - 1].x).toBeCloseTo(1, 6);
  });

  it("does nothing given no waypoints", () => {
    const m = restingMotion(1, 2, 0.3);
    expect(setCourse(m, [])).toBe(m);
    expect(stepMotion(m, FRAME, false)).toEqual({ ...m, yawRate: 0 });
  });
});

describe("coming about near land", () => {
  /** Every point of the course from the origin, leaving east, to a hex dead astern (as a ship under way comes about). */
  const reversal = (openWater?: OpenWater): Point[] => {
    const path = buildShipPath([0, 0], EAST, [[-HEX_STEP, 0]], openWater);
    const points: Point[] = [];
    for (let s = 0; s <= path.length; s += 0.01) points.push(pathPoint(path, s));
    return [...points, pathPoint(path, path.length)];
  };

  it("turns to starboard in open sea", () => {
    // Starboard of a ship heading east (+x) is −z.
    const zs = reversal(() => true).map((p) => p[1]);
    expect(Math.min(...zs)).toBeLessThan(-0.15);
    expect(Math.max(...zs)).toBeLessThan(0.05);
  });

  it("turns away from a shore on its starboard side", () => {
    // A coast along z = −0.1: land to starboard, sea to port.
    const sea: OpenWater = (_x, z) => z > -0.1;
    const points = reversal(sea);
    for (const [x, z] of points) expect(sea(x, z)).toBe(true);
    expect(Math.max(...points.map((p) => p[1]))).toBeGreaterThan(0.15); // it swung out to port
    const end = points[points.length - 1];
    expect(end[0]).toBeCloseTo(-HEX_STEP, 6);
  });

  it("tightens the arc in a channel with land on both sides", () => {
    // Open water only within 0.2 of the line it sails along.
    const channel: OpenWater = (_x, z) => Math.abs(z) < 0.2;
    const points = reversal(channel);
    for (const [x, z] of points) expect(channel(x, z)).toBe(true);
    const open = reversal(() => true);
    const width = (ps: Point[]) => Math.max(...ps.map((p) => Math.abs(p[1])));
    expect(width(points)).toBeLessThan(width(open));
  });

  it("still sails, arc and all, when no arc clears the land", () => {
    const points = reversal(() => false);
    const end = points[points.length - 1];
    expect(end[0]).toBeCloseTo(-HEX_STEP, 6);
    expect(end[1]).toBeCloseTo(0, 6);
    expect(Math.max(...points.map((p) => p[0]))).toBeGreaterThan(0); // it still sails on before turning
  });

  it("does not ask about the water when it need not come about", () => {
    let asked = 0;
    sail(setCourse(restingMotion(0, 0, EAST), [[HEX_STEP, 0]], Infinity, () => (asked++, true)));
    expect(asked).toBe(0);
  });
});
