import { describe, expect, it } from "vitest";
import { createShipFoamRegistry, type ShipFoamSource } from "../shipFoamSources";
import {
  WAKE_BREAK_DISTANCE,
  WAKE_FLOATS_A,
  WAKE_FLOATS_B,
  WAKE_LIFETIME_SECONDS,
  WAKE_MAX_LENGTH,
  WAKE_POINT_BUDGET,
  WAKE_POINT_SPACING,
  createWakeTrails,
} from "./wakeTrail";

const FRAME = 1 / 60;
const HULL = 0.8;
const BEAM = 0.22;

const ship = (x: number, z: number, speed: number, player = true): ShipFoamSource => ({
  x,
  z,
  headingX: 0,
  headingZ: 1,
  hullLength: HULL,
  beam: BEAM,
  roundness: 1,
  speed,
  player,
});

interface Segment {
  a: [number, number];
  b: [number, number];
  ageA: number;
  ageB: number;
  pathA: number;
  beam: number;
}

const read = (trails: ReturnType<typeof createWakeTrails>): Segment[] => {
  const a = new Float32Array(WAKE_POINT_BUDGET * WAKE_FLOATS_A);
  const b = new Float32Array(WAKE_POINT_BUDGET * WAKE_FLOATS_B);
  const n = trails.fill(a, b);
  return Array.from({ length: n }, (_, i) => ({
    a: [a[i * 4], a[i * 4 + 1]],
    b: [a[i * 4 + 2], a[i * 4 + 3]],
    ageA: b[i * 4],
    ageB: b[i * 4 + 1],
    pathA: b[i * 4 + 2],
    beam: b[i * 4 + 3],
  }));
};

/** Sails ship `id` in a straight line along +z from `z0` at `speed` for `seconds`, one update per frame. */
const sail = (
  trails: ReturnType<typeof createWakeTrails>,
  registry: ReturnType<typeof createShipFoamRegistry>,
  id: string,
  x: number,
  z0: number,
  speed: number,
  seconds: number,
  wrap = 0,
) => {
  const frames = Math.round(seconds / FRAME);
  for (let f = 1; f <= frames; f++) {
    registry.set(id, ship(x, z0 + speed * f * FRAME, speed));
    trails.update(FRAME, registry, wrap);
  }
};

describe("wake trails", () => {
  it("lays no trail for a ship at rest", () => {
    const registry = createShipFoamRegistry();
    const trails = createWakeTrails();
    for (let f = 0; f < 120; f++) {
      registry.set("a", ship(1, 2, 0));
      trails.update(FRAME, registry, 0);
    }
    expect(trails.pointCount()).toBe(0);
    expect(read(trails)).toHaveLength(0);
  });

  it("lays points along a moving ship's path, spaced along it, joined to the ship", () => {
    const registry = createShipFoamRegistry();
    const trails = createWakeTrails();
    sail(trails, registry, "a", 1, 0, 2, 1); // 2 units along +z
    const segments = read(trails);
    expect(segments.length).toBeGreaterThan(4);
    for (const s of segments) {
      expect(s.a[0]).toBeCloseTo(1, 5);
      expect(s.b[0]).toBeCloseTo(1, 5);
      expect(s.a[1]).toBeGreaterThan(s.b[1] - 1e-6); // each runs astern from its newer end
      expect(s.a[1] - s.b[1]).toBeLessThanOrEqual(WAKE_POINT_SPACING + 2 * FRAME + 1e-6);
      expect(s.beam).toBeCloseTo(BEAM, 6);
    }
    // The first segment starts at the ship, half a hull astern of the bow; each continues the last.
    expect(segments[0].a[1]).toBeCloseTo(2, 5);
    expect(segments[0].pathA).toBeCloseTo(HULL / 2, 6);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].a).toEqual(segments[i - 1].b);
      expect(segments[i].pathA).toBeCloseTo(segments[i - 1].pathA + (segments[i - 1].a[1] - segments[i - 1].b[1]), 5);
      expect(segments[i].ageA).toBeCloseTo(segments[i - 1].ageB, 6);
    }
  });

  it("ages the points and drops them after the lifetime", () => {
    const registry = createShipFoamRegistry();
    const trails = createWakeTrails();
    sail(trails, registry, "a", 0, 0, 2, 1);
    const fresh = read(trails);
    const oldestFresh = Math.max(...fresh.map((s) => s.ageB));
    // The ship stops; its trail ages.
    for (let f = 0; f < 60; f++) {
      registry.set("a", ship(0, 2, 0));
      trails.update(FRAME, registry, 0);
    }
    const aged = read(trails);
    expect(Math.max(...aged.map((s) => s.ageB))).toBeCloseTo(oldestFresh + 1, 4);
    for (let f = 0; f < Math.ceil(WAKE_LIFETIME_SECONDS / FRAME); f++) {
      registry.set("a", ship(0, 2, 0));
      trails.update(FRAME, registry, 0);
    }
    expect(read(trails)).toHaveLength(0);
    expect(trails.pointCount()).toBe(0);
  });

  it("never holds more than the point budget, and drops the oldest points first", () => {
    const registry = createShipFoamRegistry();
    const trails = createWakeTrails();
    // Ship "old" sails first, then stops ...
    sail(trails, registry, "old", 0, 0, 3, 1);
    const oldCount = trails.pointCount();
    expect(oldCount).toBeGreaterThan(0);
    // ... then three more sail together, laying more than the budget between them.
    const frames = Math.round(2.5 / FRAME);
    for (let f = 1; f <= frames; f++) {
      registry.set("old", ship(0, 3, 0));
      for (const [i, id] of ["n1", "n2", "n3"].entries()) registry.set(id, ship(10 + i * 5, 3 * f * FRAME, 3));
      trails.update(FRAME, registry, 0);
      expect(trails.pointCount()).toBeLessThanOrEqual(WAKE_POINT_BUDGET);
    }
    expect(trails.pointCount()).toBe(WAKE_POINT_BUDGET);
    const segments = read(trails);
    expect(segments.length).toBeLessThanOrEqual(WAKE_POINT_BUDGET);
    // The old ship's points went first; the newest ships still have theirs.
    expect(segments.some((s) => s.a[0] === 0 || s.b[0] === 0)).toBe(false);
    for (const x of [10, 15, 20]) expect(segments.some((s) => s.a[0] === x)).toBe(true);
  });

  it("keeps a trail no longer than its length", () => {
    const registry = createShipFoamRegistry();
    const trails = createWakeTrails();
    sail(trails, registry, "a", 0, 0, 4, 3); // 12 units
    const segments = read(trails);
    const last = segments[segments.length - 1];
    const drawn = last.pathA + Math.hypot(last.b[0] - last.a[0], last.b[1] - last.a[1]) - HULL / 2;
    expect(drawn).toBeLessThanOrEqual(WAKE_MAX_LENGTH + WAKE_POINT_SPACING);
    expect(drawn).toBeGreaterThan(WAKE_MAX_LENGTH - 2 * WAKE_POINT_SPACING);
  });

  it("keeps a path across the east–west seam continuous", () => {
    const wrap = 10;
    const registry = createShipFoamRegistry();
    const trails = createWakeTrails();
    // Up to the east edge ...
    for (let f = 1; f <= 30; f++) {
      registry.set("a", ship(8.5 + (f / 30), 0, 2));
      trails.update(FRAME, registry, wrap);
    }
    // ... then, as Ship.tsx does over the seam, the canonical x jumps by the
    // wrap width (seamAwareStart) and sails on from the west edge.
    for (let f = 0; f <= 30; f++) {
      registry.set("a", ship(-0.5 + f / 30, 0, 2));
      trails.update(FRAME, registry, wrap);
    }
    const segments = read(trails);
    expect(segments.length).toBeGreaterThan(4);
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      expect(Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1])).toBeLessThanOrEqual(WAKE_POINT_SPACING + 0.1);
      if (i > 0) expect(s.a).toEqual(segments[i - 1].b);
    }
    // One trail, 2 units long: from x = 8.5 to 10.5 in one unwrapped run.
    const xs = segments.flatMap((s) => [s.a[0], s.b[0]]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 - 1 / 30, 1);
  });

  it("lays nothing and holds still while the wave clock is frozen (reduced motion)", () => {
    const registry = createShipFoamRegistry();
    const trails = createWakeTrails();
    for (let f = 1; f <= 60; f++) {
      registry.set("a", ship(0, f * 0.05, 3));
      trails.update(0, registry, 0);
    }
    expect(trails.pointCount()).toBe(0);
    sail(trails, registry, "a", 1, 0, 2, 0.5);
    const before = read(trails);
    for (let f = 1; f <= 60; f++) {
      registry.set("a", ship(1, 1 + f * 0.05, 3));
      trails.update(0, registry, 0);
    }
    expect(read(trails)).toEqual(before);
  });

  it("lays no new wake for a ship that has left the water (sunk), and lets its wake fade", () => {
    const registry = createShipFoamRegistry();
    const trails = createWakeTrails();
    sail(trails, registry, "a", 0, 0, 2, 1);
    const count = trails.pointCount();
    registry.remove("a");
    for (let f = 0; f < 30; f++) trails.update(FRAME, registry, 0);
    expect(trails.pointCount()).toBeLessThanOrEqual(count);
    expect(read(trails).length).toBeGreaterThan(0);
    for (let f = 0; f < Math.ceil(WAKE_LIFETIME_SECONDS / FRAME); f++) trails.update(FRAME, registry, 0);
    expect(read(trails)).toHaveLength(0);
  });

  it("breaks the trail rather than draw a segment across a jump", () => {
    const registry = createShipFoamRegistry();
    const trails = createWakeTrails();
    sail(trails, registry, "a", 0, 0, 2, 0.5);
    sail(trails, registry, "a", 0, 0 + 1 + WAKE_BREAK_DISTANCE + 1, 2, 0.5);
    for (const s of read(trails)) {
      expect(Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1])).toBeLessThanOrEqual(WAKE_POINT_SPACING + 0.1);
    }
  });
});
