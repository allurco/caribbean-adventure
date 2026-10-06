import { describe, it, expect } from "vitest";
import { createFacetBuilder, shadeRgb, type Vec3 } from "./facetBuilder";

function triangleNormal(p: Float32Array, t: number): Vec3 {
  const v = (k: number): Vec3 => [p[(t * 3 + k) * 3], p[(t * 3 + k) * 3 + 1], p[(t * 3 + k) * 3 + 2]];
  const [a, b, c] = [v(0), v(1), v(2)];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const len = Math.hypot(...n);
  return [n[0] / len, n[1] / len, n[2] / len];
}

describe("createFacetBuilder", () => {
  it("builds an axis-aligned box of 12 outward-facing triangles", () => {
    const b = createFacetBuilder();
    b.box([-1, 0, -2], [1, 3, 2], [0.5, 0.5, 0.5]);
    const g = b.build();
    expect(g.vertexCount).toBe(36);
    expect(g.colors).toHaveLength(36 * 3);
    for (let t = 0; t < 12; t++) {
      const n = triangleNormal(g.positions, t);
      // Centroid relative to the box centre lies on the normal's side.
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < 3; k++) {
        cx += g.positions[(t * 3 + k) * 3] / 3;
        cy += g.positions[(t * 3 + k) * 3 + 1] / 3 - 1.5 / 3;
        cz += g.positions[(t * 3 + k) * 3 + 2] / 3;
      }
      expect(cx * n[0] + cy * n[1] + cz * n[2]).toBeGreaterThan(0);
      // Stored normal is the face normal.
      expect(g.normals[t * 9]).toBeCloseTo(n[0], 5);
      expect(g.normals[t * 9 + 1]).toBeCloseTo(n[1], 5);
      expect(g.normals[t * 9 + 2]).toBeCloseTo(n[2], 5);
    }
  });

  it("builds a prism between two rings, skipping the degenerate faces of a pyramid apex", () => {
    const b = createFacetBuilder();
    const base: Vec3[] = [
      [-1, 0, -1],
      [-1, 0, 1],
      [1, 0, 1],
      [1, 0, -1],
    ];
    const apex: Vec3 = [0, 2, 0];
    b.prism(base, [apex, apex, apex, apex], [1, 0, 0]);
    const g = b.build();
    // 2 base triangles + 4 sides (the top ring collapses to nothing).
    expect(g.vertexCount / 3).toBe(6);
    for (let t = 0; t < g.vertexCount / 3; t++) {
      const n = triangleNormal(g.positions, t);
      let cy = 0;
      for (let k = 0; k < 3; k++) cy += g.positions[(t * 3 + k) * 3 + 1] / 3;
      // Base faces down, sides face up and out.
      if (cy < 1e-9) expect(n[1]).toBeCloseTo(-1, 5);
      else expect(n[1]).toBeGreaterThan(0);
    }
  });

  it("drops the bottom face when asked, for parts nobody sees from below", () => {
    const b = createFacetBuilder();
    b.box([0, 0, 0], [1, 1, 1], [0, 0, 0], { bottom: false });
    expect(b.build().vertexCount / 3).toBe(10);
  });

  it("shades a colour and clamps it to [0, 1]", () => {
    expect(shadeRgb([0.5, 0.4, 0.2], 1.5)).toEqual([0.75, 0.6000000000000001, 0.30000000000000004]);
    expect(shadeRgb([0.8, 0.8, 0.8], 2)).toEqual([1, 1, 1]);
  });
});
