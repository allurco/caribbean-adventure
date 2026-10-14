import { describe, it, expect } from "vitest";
import { flagUvs } from "./flagUvs";

// The generator's flag (boats/frigate/wind.py `flag_grid`), in glTF's frame:
// x across, y up, z aft (the bow along −z). It hangs from a staff and flies
// downwind, forward, waving across the wind and drooping toward its fly.
const FLY = 2.6;
const HOIST = 1.55;
const WAVE = 0.3;
const WAVES = 1.35;
const DROOP = 0.22;
const NU = 11;
const NV = 5;

interface Node {
  u: number; // 0 at the staff, 1 at the fly
  t: number; // 0 at the head, 1 at the foot
  p: [number, number, number];
}

/** The flag's grid nodes, its staff at `staff`, flying toward `azimuth` (radians off −z toward +x). */
const flag = (staff: [number, number, number], azimuth: number): Node[] => {
  const [dx, dz] = [Math.sin(azimuth), -Math.cos(azimuth)];
  const [nx, nz] = [-dz, dx];
  const nodes: Node[] = [];
  for (let j = 0; j < NV; j++) {
    const t = j / (NV - 1);
    for (let i = 0; i < NU; i++) {
      const u = i / (NU - 1);
      const wave = WAVE * u ** 1.3 * Math.sin(2 * Math.PI * WAVES * u);
      nodes.push({
        u,
        t,
        p: [staff[0] + dx * FLY * u + nx * wave, staff[1] - HOIST * t - DROOP * u, staff[2] + dz * FLY * u + nz * wave],
      });
    }
  }
  return nodes;
};

const positions = (nodes: Node[]): Float32Array => new Float32Array(nodes.flatMap((n) => n.p));

/**
 * Within a hundredth of the cloth: about a texel of the flag's texture. The
 * wave tilts the flag's main axis a little off its true line of flight.
 */
const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThan(0.01);

describe("flagUvs", () => {
  it.each([
    ["the frigate's mizzen, wind 14° off the bow", [0, 30, 12] as [number, number, number], (14 * Math.PI) / 180],
    ["a twisted wind of 28°", [1, 18, -3] as [number, number, number], (28 * Math.PI) / 180],
    ["a flag flying dead ahead", [0, 20, 5] as [number, number, number], 0],
  ])("maps the hoist to u = 0, the fly to u = 1, the head to v = 1 and the foot to v = 0 (%s)", (_name, staff, azimuth) => {
    const nodes = flag(staff, azimuth);
    const uv = flagUvs(positions(nodes));
    nodes.forEach((node, k) => {
      near(uv[2 * k], node.u);
      near(uv[2 * k + 1], 1 - node.t);
    });
  });

  it("does not depend on the order of the vertices", () => {
    const nodes = flag([0, 30, 12], 0.3);
    const shuffled = [...nodes.slice(20), ...nodes.slice(0, 20)].reverse();
    const uv = flagUvs(positions(shuffled));
    shuffled.forEach((node, k) => {
      near(uv[2 * k], node.u);
      near(uv[2 * k + 1], 1 - node.t);
    });
  });

  it("finds the hoist by the droop, not by which way the ship faces", () => {
    // The same flag turned half round about the vertical: its fly now aft.
    const nodes = flag([0, 30, 12], 0.2).map((n) => ({ ...n, p: [-n.p[0], n.p[1], -n.p[2]] as [number, number, number] }));
    const uv = flagUvs(positions(nodes));
    nodes.forEach((node, k) => near(uv[2 * k], node.u));
  });

  it("spans the whole texture, 0 to 1 both ways", () => {
    const uv = flagUvs(positions(flag([0, 30, 12], 0.25)));
    const us = [...uv].filter((_, i) => i % 2 === 0);
    const vs = [...uv].filter((_, i) => i % 2 === 1);
    expect(Math.min(...us)).toBeCloseTo(0, 6);
    expect(Math.max(...us)).toBeCloseTo(1, 6);
    expect(Math.min(...vs)).toBeCloseTo(0, 6);
    expect(Math.max(...vs)).toBeCloseTo(1, 6);
  });
});
