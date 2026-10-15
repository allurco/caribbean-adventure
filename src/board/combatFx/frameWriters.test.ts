import { describe, expect, it } from "vitest";
import { InstancedBufferAttribute, InstancedBufferGeometry, Vector3 } from "three";
import { ropePoint, writePuffs } from "./frameWriters";
import { createPool, spawn, type ParticleKind } from "./particlePool";

const KIND: ParticleKind = { gravity: 0, drag: 1, windFollow: 0, onSea: "pass", life: 10 };
const LOOK = { opacity: 0.5, grow: 2, growSeconds: 1, fadeIn: 0.1, fadeOut: 0.1 };

describe("writing the effects into their buffers (#263)", () => {
  it("packs the live particles, and only those, into the instances", () => {
    const pool = createPool(4);
    spawn(pool, KIND, { x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0, size: 0.1 });
    spawn(pool, KIND, { x: 4, y: 5, z: 6, vx: 0, vy: 0, vz: 0, size: 0.2 });
    pool.state[0] = 0;
    const attr = (n: number) => new InstancedBufferAttribute(new Float32Array(4 * n), n);
    const buffers = { offset: attr(3), size: attr(1), alpha: attr(1), seed: attr(1) };
    const geometry = new InstancedBufferGeometry();
    writePuffs(pool, LOOK, buffers, geometry);
    expect(geometry.instanceCount).toBe(1);
    expect(Array.from(buffers.offset.array.slice(0, 3))).toEqual([4, 5, 6]);
    expect(buffers.size.array[0]).toBeCloseTo(0.2, 6); // not grown yet at age 0
  });

  it("a grapple's line sags between the rails once it has bitten, and lies along the hook's flight before", () => {
    const from = new Vector3(0, 0.1, 0);
    const to = new Vector3(0.4, 0.1, 0);
    const scratch = { x: 0, y: 0, z: 0 };
    const mid = new Vector3();
    ropePoint(from, to, 0.5, 2, 0.02, scratch, mid);
    expect(mid.x).toBeCloseTo(0.2, 6);
    expect(mid.y).toBeCloseTo(0.1 - 0.02, 6);
    const flying = new Vector3();
    ropePoint(from, to, 1, 0.5, 0, scratch, flying);
    expect(flying.x).toBeCloseTo(0.2, 6); // the line's end is the hook, halfway there
    expect(flying.y).toBeGreaterThan(0.1); // arcing up
  });
});
