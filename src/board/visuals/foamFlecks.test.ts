import { describe, expect, it } from "vitest";
import { createPool } from "../combatFx/particlePool";
import type { ShipFoamSource } from "../shipFoamSources";
import { stream } from "./variationStream";
import {
  FLECK_LIFE_ANCHOR,
  FLECK_LIFE_UNDERWAY,
  FLECK_OUT_GAIN,
  FLECK_OUT_SPEED,
  FLECK_RATE_ANCHOR,
  FLECK_RATE_UNDERWAY,
  createFleckEmitters,
  createFleckFrame,
  fleckSpawn,
  fleckSpawnRate,
  hullFrameToWorld,
  stepFlecks,
  waterlineHalfBeam,
  writeFlecks,
} from "./foamFlecks";
import { HULL_FOAM_FULL_SPEED } from "./hullFoam";

const hull = { halfLength: 0.44, halfBeam: 0.1 };

const ship = (over: Partial<ShipFoamSource> = {}): ShipFoamSource => ({
  x: 5, z: 3, headingX: 0, headingZ: 1, hullLength: 0.88, beam: 0.2, roundness: 1.5, speed: 0, player: true, ...over,
});

const registry = (ships: Record<string, ShipFoamSource>) => ({
  forEach: (visit: (s: ShipFoamSource, id: string) => void) => Object.entries(ships).forEach(([id, s]) => visit(s, id)),
});

const live = (pool: ReturnType<typeof createPool>) => {
  let n = 0;
  for (let i = 0; i < pool.capacity; i++) if (pool.state[i] !== 0) n++;
  return n;
};

describe("fleckSpawnRate", () => {
  it("is a sparse few at anchor and many under way, full from the hull foam's full speed", () => {
    expect(fleckSpawnRate(0)).toBe(FLECK_RATE_ANCHOR);
    expect(FLECK_RATE_ANCHOR).toBeGreaterThan(0);
    expect(FLECK_RATE_ANCHOR).toBeLessThan(6);
    expect(fleckSpawnRate(HULL_FOAM_FULL_SPEED / 2)).toBeGreaterThan(FLECK_RATE_ANCHOR);
    expect(fleckSpawnRate(HULL_FOAM_FULL_SPEED)).toBe(FLECK_RATE_UNDERWAY);
    expect(fleckSpawnRate(10)).toBe(FLECK_RATE_UNDERWAY);
    expect(FLECK_RATE_UNDERWAY).toBeGreaterThan(8 * FLECK_RATE_ANCHOR);
  });
});

describe("waterlineHalfBeam", () => {
  it("is the half beam amidships and narrows to nothing at the stem and the stern", () => {
    expect(waterlineHalfBeam(0, hull.halfBeam)).toBeCloseTo(hull.halfBeam, 12);
    expect(waterlineHalfBeam(0.9, hull.halfBeam)).toBeLessThan(waterlineHalfBeam(0.5, hull.halfBeam));
    expect(waterlineHalfBeam(1, hull.halfBeam)).toBe(0);
    expect(waterlineHalfBeam(-1, hull.halfBeam)).toBe(0);
  });
});

describe("fleckSpawn", () => {
  const sample = (motion: number, n = 2000) => {
    const random = stream(1234);
    return Array.from({ length: n }, () => fleckSpawn(random, hull, motion));
  };

  it("starts on the waterline, just outside the hull, and moves away from it", () => {
    for (const f of sample(0.6, 500)) {
      const edge = waterlineHalfBeam(f.along / hull.halfLength, hull.halfBeam);
      expect(Math.abs(f.across)).toBeGreaterThanOrEqual(edge - 1e-9);
      expect(Math.abs(f.across)).toBeLessThan(edge + 0.5 * hull.halfBeam);
      expect(Math.abs(f.along)).toBeLessThanOrEqual(hull.halfLength + 1e-9);
      expect(Math.sign(f.vAcross)).toBe(Math.sign(f.across));
    }
  });

  it("comes mostly from the bow under way, from all along the hull at anchor", () => {
    const forward = (motion: number) => sample(motion).filter((f) => f.along > 0.4 * hull.halfLength).length / 2000;
    expect(forward(1)).toBeGreaterThan(0.5);
    expect(forward(0)).toBeLessThan(0.45);
  });

  it("lives longer at anchor than under way, within the set ranges", () => {
    for (const f of sample(0, 200)) {
      expect(f.life).toBeGreaterThanOrEqual(FLECK_LIFE_ANCHOR[0]);
      expect(f.life).toBeLessThanOrEqual(FLECK_LIFE_ANCHOR[1]);
    }
    for (const f of sample(1, 200)) {
      expect(f.life).toBeGreaterThanOrEqual(FLECK_LIFE_UNDERWAY[0]);
      expect(f.life).toBeLessThanOrEqual(FLECK_LIFE_UNDERWAY[1]);
    }
  });
});

describe("hullFrameToWorld", () => {
  it("puts `along` on the heading and `across` square to it, from the ship's position", () => {
    const out: [number, number] = [0, 0];
    hullFrameToWorld(1, 0, ship({ headingX: 1, headingZ: 0 }), out);
    expect(out).toEqual([6, 3]);
    hullFrameToWorld(0, 1, ship({ headingX: 1, headingZ: 0 }), out);
    expect(out[0]).toBeCloseTo(5, 12);
    expect(Math.abs(out[1] - 3)).toBeCloseTo(1, 12);
  });
});

describe("createFleckEmitters", () => {
  it("spawns about the rate over time, the same flecks for the same seed, none while the clock is frozen", () => {
    const run = (seed: number) => {
      const pool = createPool(512);
      const emitters = createFleckEmitters(seed);
      const ships = registry({ a: ship({ speed: HULL_FOAM_FULL_SPEED }) });
      for (let i = 0; i < 10; i++) emitters.emit(0.01, ships, pool);
      return pool;
    };
    const a = run(7);
    const b = run(7);
    expect(Array.from(a.px)).toEqual(Array.from(b.px));
    expect(live(a)).toBeGreaterThan(0.5 * FLECK_RATE_UNDERWAY * 0.1);
    expect(live(a)).toBeLessThan(1.5 * FLECK_RATE_UNDERWAY * 0.1 + 1);
    expect(Array.from(run(8).px)).not.toEqual(Array.from(a.px));

    const frozen = createPool(64);
    createFleckEmitters(7).emit(0, registry({ a: ship({ speed: HULL_FOAM_FULL_SPEED }) }), frozen);
    expect(live(frozen)).toBe(0);
  });

  it("never throws flecks ahead of the ship, however high the speed it reports (it eases off after a move)", () => {
    const pool = createPool(512);
    createFleckEmitters(5).emit(0.5, registry({ a: ship({ speed: 4 }) }), pool);
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.state[i] === 0) continue;
      expect(pool.vz[i]).toBeLessThanOrEqual(1.5 * (FLECK_OUT_SPEED + FLECK_OUT_GAIN)); // the bow points +z
    }
  });

  it("spawns a sparse few at anchor", () => {
    const pool = createPool(512);
    const emitters = createFleckEmitters(1);
    for (let i = 0; i < 100; i++) emitters.emit(0.01, registry({ a: ship() }), pool);
    expect(live(pool)).toBeLessThanOrEqual(Math.ceil(FLECK_RATE_ANCHOR) + 1);
  });
});

describe("stepFlecks", () => {
  it("lets each fleck drift, slow in the water and die at the end of its life; nothing moves on a frozen clock", () => {
    const pool = createPool(4);
    const emitters = createFleckEmitters(3);
    while (live(pool) === 0) emitters.emit(0.05, registry({ a: ship({ speed: HULL_FOAM_FULL_SPEED }) }), pool);
    const i = pool.state.findIndex((s) => s !== 0);
    const [x, v] = [pool.px[i], Math.hypot(pool.vx[i], pool.vz[i])];
    stepFlecks(pool, 0);
    expect(pool.px[i]).toBe(x);
    stepFlecks(pool, 0.1);
    expect(Math.hypot(pool.vx[i], pool.vz[i])).toBeLessThan(v);
    expect(pool.px[i]).not.toBe(x);
    stepFlecks(pool, pool.life[i]);
    expect(pool.state[i]).toBe(0);
  });
});

describe("writeFlecks", () => {
  const target = () => ({ offset: new Float32Array(12), size: new Float32Array(4), alpha: new Float32Array(4), seed: new Float32Array(4) });
  const onePool = (x: number, z: number) => {
    const pool = createPool(4);
    pool.state[0] = 1;
    pool.px[0] = x;
    pool.pz[0] = z;
    pool.life[0] = 2;
    pool.age[0] = 1;
    pool.size[0] = 0.02;
    return pool;
  };

  it("draws nothing from the ship view out (weight 0)", () => {
    expect(writeFlecks(onePool(1, 1), target(), { weight: 0, focusX: 0, wrap: 0, seaHeight: () => 0 })).toBe(0);
  });

  it("puts each fleck on the sea where it is drawn, in the copy of the world nearest the camera", () => {
    const out = target();
    const n = writeFlecks(onePool(1, 2), out, { weight: 1, focusX: 41, wrap: 40, seaHeight: (x, z) => x * 0.001 + z });
    expect(n).toBe(1);
    expect(out.offset[0]).toBe(41);
    expect(out.offset[1]).toBeCloseTo(0.041 + 2, 6);
    expect(out.offset[2]).toBe(2);
    expect(out.alpha[0]).toBeGreaterThan(0);
  });

  it("fades with the close-up weight", () => {
    const full = target();
    const half = target();
    writeFlecks(onePool(1, 2), full, { weight: 1, focusX: 0, wrap: 0, seaHeight: () => 0 });
    writeFlecks(onePool(1, 2), half, { weight: 0.5, focusX: 0, wrap: 0, seaHeight: () => 0 });
    expect(half.alpha[0]).toBeCloseTo(full.alpha[0] / 2, 6);
  });
});

describe("createFleckFrame", () => {
  const target = () => ({ offset: new Float32Array(3 * 64), size: new Float32Array(64), alpha: new Float32Array(64), seed: new Float32Array(64) });
  const sea = { heightAt: (x: number) => 0.01 * x };
  const frame = (over: Partial<Parameters<ReturnType<typeof createFleckFrame>["update"]>[0]> = {}) => ({
    waveTime: 0, camera: [5, 1, 4] as const, focusX: 5, cameraDistance: 1.2, wrap: 0, surface: sea,
    ships: registry({ a: ship({ speed: HULL_FOAM_FULL_SPEED }) }), ...over,
  });

  it("sheds on the wave clock's step and draws the flecks on the sea up close", () => {
    const flecks = createFleckFrame(1, 64);
    const out = target();
    expect(flecks.update(frame({ waveTime: 10 }), out)).toBe(0); // the first frame has no step
    const n = flecks.update(frame({ waveTime: 10.1 }), out);
    expect(n).toBeGreaterThan(0);
    expect(out.offset[1]).toBeCloseTo(0.01 * out.offset[0], 5);
  });

  it("draws nothing from the ship view out, and sheds nothing while the clock is frozen", () => {
    const flecks = createFleckFrame(1, 64);
    const out = target();
    flecks.update(frame({ waveTime: 10 }), out);
    expect(flecks.update(frame({ waveTime: 10.1, cameraDistance: 3.4 }), out)).toBe(0);
    const frozen = createFleckFrame(1, 64);
    frozen.update(frame({ waveTime: 10 }), out);
    expect(frozen.update(frame({ waveTime: 10 }), out)).toBe(0);
  });
});
