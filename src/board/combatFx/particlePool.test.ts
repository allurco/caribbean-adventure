import { describe, expect, it } from "vitest";
import { aliveCount, createPool, envelope, spawn, stepPool, type ParticleKind } from "./particlePool";

const SMOKE: ParticleKind = { gravity: -0.02, drag: 2, windFollow: 1, onSea: "pass", life: 20 };
const SPRAY: ParticleKind = { gravity: 2.5, drag: 0.2, windFollow: 0, onSea: "die", life: 3 };
const CRATE: ParticleKind = { gravity: 2.5, drag: 0.5, windFollow: 0.3, onSea: "float", life: 40 };
const flatSea = { windX: 0.05, windZ: 0, seaHeight: () => 0 };

const run = (seconds: number, step: (dt: number) => void) => {
  for (let t = 0; t < seconds; t += 1 / 60) step(1 / 60);
};

describe("particle pool", () => {
  it("smoke blown out of the gun slows, then drifts downwind and lingers", () => {
    const pool = createPool(8);
    spawn(pool, SMOKE, { x: 0, y: 0.05, z: 0, vx: 0, vy: 0, vz: 1, size: 0.1 });
    run(10, (dt) => stepPool(pool, SMOKE, dt, flatSea));
    expect(aliveCount(pool)).toBe(1);
    expect(pool.px[0]).toBeGreaterThan(0.4); // downwind (+x), well past where the shot pushed it
    expect(pool.vx[0]).toBeCloseTo(0.05, 3); // at the wind's drift
    expect(pool.pz[0]).toBeLessThan(0.6); // the muzzle blast died out
    expect(pool.py[0]).toBeGreaterThan(0.05); // and it rose a little
  });

  it("powder smoke held to a low bank hugs the water: it never rises past its ceiling over the swell", () => {
    const BANK: ParticleKind = { ...SMOKE, gravity: -0.05, ceiling: 0.08 };
    const swell = { windX: 0.05, windZ: 0, seaHeight: (x: number) => 0.02 * Math.sin(x * 10) };
    const pool = createPool(8);
    spawn(pool, BANK, { x: 0, y: 0.05, z: 0, vx: 0, vy: 0.3, vz: 0.6, size: 0.1 });
    let highest = -Infinity;
    run(8, (dt) => {
      stepPool(pool, BANK, dt, swell);
      highest = Math.max(highest, pool.py[0] - swell.seaHeight(pool.px[0]));
    });
    expect(highest).toBeLessThanOrEqual(0.08 + 1e-6); // float32 positions
    expect(pool.px[0]).toBeGreaterThan(0.3); // still blown downwind
  });

  it("smoke is gone once its life is over", () => {
    const pool = createPool(8);
    spawn(pool, SMOKE, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1 });
    run(21, (dt) => stepPool(pool, SMOKE, dt, flatSea));
    expect(aliveCount(pool)).toBe(0);
  });

  it("spray thrown up falls back and dies in the sea", () => {
    const pool = createPool(8);
    spawn(pool, SPRAY, { x: 0, y: 0, z: 0, vx: 0, vy: 1, vz: 0, size: 0.02 });
    run(0.3, (dt) => stepPool(pool, SPRAY, dt, flatSea));
    expect(aliveCount(pool)).toBe(1);
    expect(pool.py[0]).toBeGreaterThan(0.1);
    run(1, (dt) => stepPool(pool, SPRAY, dt, flatSea));
    expect(aliveCount(pool)).toBe(0);
  });

  it("a crate falls onto the swell and rides it, drifting downwind", () => {
    const pool = createPool(8);
    const swell = { windX: 0.05, windZ: 0, seaHeight: (x: number) => 0.02 * Math.sin(x * 10) };
    spawn(pool, CRATE, { x: 0, y: 0.1, z: 0, vx: 0.3, vy: 0.4, vz: 0, size: 0.03 });
    run(6, (dt) => stepPool(pool, CRATE, dt, swell));
    expect(aliveCount(pool)).toBe(1);
    expect(pool.py[0]).toBeCloseTo(swell.seaHeight(pool.px[0]), 6);
    const x = pool.px[0];
    run(4, (dt) => stepPool(pool, CRATE, dt, swell));
    expect(pool.px[0]).toBeGreaterThan(x);
  });

  it("a full pool reuses its oldest slot", () => {
    const pool = createPool(2);
    for (let i = 0; i < 3; i++) spawn(pool, SMOKE, { x: i, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1 });
    expect(aliveCount(pool)).toBe(2);
    expect([...pool.px].sort()).toEqual([1, 2]);
  });
});

describe("envelope", () => {
  it("fades in, holds, and fades out", () => {
    expect(envelope(0, 0.1, 0.3)).toBe(0);
    expect(envelope(0.5, 0.1, 0.3)).toBe(1);
    expect(envelope(0.85, 0.1, 0.3)).toBeCloseTo(0.5, 6);
    expect(envelope(1, 0.1, 0.3)).toBe(0);
  });
});
