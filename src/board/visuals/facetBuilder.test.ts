import { describe, it, expect } from "vitest";
import { createFacetBuilder, shadeRgb, type FacetGeometryData, type Vec3 } from "./facetBuilder";

function triangleNormal(p: Float32Array, t: number): Vec3 {
  const v = (k: number): Vec3 => [p[(t * 3 + k) * 3], p[(t * 3 + k) * 3 + 1], p[(t * 3 + k) * 3 + 2]];
  const [a, b, c] = [v(0), v(1), v(2)];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const len = Math.hypot(...n);
  return [n[0] / len, n[1] / len, n[2] / len];
}

const vertex = (g: FacetGeometryData, i: number): Vec3 => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
const normal = (g: FacetGeometryData, i: number): Vec3 => [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]];
const color = (g: FacetGeometryData, i: number): Vec3 => [g.colors[i * 3], g.colors[i * 3 + 1], g.colors[i * 3 + 2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const positionKey = (p: Vec3) => p.map((v) => Math.round(v * 1e5)).join(",");

function expectUnitNormals(g: FacetGeometryData) {
  for (let i = 0; i < g.vertexCount; i++) expect(Math.hypot(...normal(g, i))).toBeCloseTo(1, 5);
}

function expectNoDegenerateTriangles(g: FacetGeometryData) {
  for (let t = 0; t < g.vertexCount / 3; t++) {
    const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    expect(Math.hypot(n[0], n[1], n[2])).toBeGreaterThan(1e-9);
  }
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

  it("counts the vertices collected so far, so passes can address a range", () => {
    const b = createFacetBuilder();
    expect(b.vertexCount()).toBe(0);
    b.box([0, 0, 0], [1, 1, 1], [0, 0, 0]);
    expect(b.vertexCount()).toBe(36);
  });
});

describe("bevelledBox", () => {
  const min: Vec3 = [-1, 0, -2];
  const max: Vec3 = [1, 3, 2];
  const bevel = 0.1;

  it("chamfers every edge and corner: 6 faces, 12 edge strips and 8 corner triangles", () => {
    const b = createFacetBuilder();
    b.bevelledBox(min, max, bevel, [0.5, 0.5, 0.5]);
    const g = b.build();
    expect(g.vertexCount / 3).toBe(6 * 2 + 12 * 2 + 8);
    expect(g.colors).toHaveLength(g.vertexCount * 3);
    expectUnitNormals(g);
    expectNoDegenerateTriangles(g);
  });

  it("keeps every vertex inside the box and reaches its bounds", () => {
    const b = createFacetBuilder();
    b.bevelledBox(min, max, bevel, [0.5, 0.5, 0.5]);
    const g = b.build();
    const lo: Vec3 = [Infinity, Infinity, Infinity];
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < g.vertexCount; i++) {
      const p = vertex(g, i);
      for (let k = 0; k < 3; k++) {
        expect(p[k]).toBeGreaterThanOrEqual(min[k] - 1e-9);
        expect(p[k]).toBeLessThanOrEqual(max[k] + 1e-9);
        lo[k] = Math.min(lo[k], p[k]);
        hi[k] = Math.max(hi[k], p[k]);
      }
    }
    expect(lo).toEqual(min);
    expect(hi).toEqual(max);
  });

  it("winds every facet outwards with its flat normal stored", () => {
    const b = createFacetBuilder();
    b.bevelledBox(min, max, bevel, [0.5, 0.5, 0.5]);
    const g = b.build();
    const centre: Vec3 = [0, 1.5, 0];
    for (let t = 0; t < g.vertexCount / 3; t++) {
      const n = triangleNormal(g.positions, t);
      const c = [0, 1, 2].map((k) => (vertex(g, t * 3)[k] + vertex(g, t * 3 + 1)[k] + vertex(g, t * 3 + 2)[k]) / 3) as Vec3;
      expect(dot(n, [c[0] - centre[0], c[1] - centre[1], c[2] - centre[2]])).toBeGreaterThan(0);
      for (let k = 0; k < 3; k++) expect(dot(normal(g, t * 3 + k), n)).toBeCloseTo(1, 5);
    }
  });

  it("sets the edge chamfers at 45 degrees between their two faces", () => {
    const b = createFacetBuilder();
    b.bevelledBox(min, max, bevel, [0.5, 0.5, 0.5]);
    const g = b.build();
    let chamferVertices = 0;
    for (let i = 0; i < g.vertexCount; i++) {
      const n = normal(g, i).map(Math.abs);
      const diagonal = n.filter((v) => Math.abs(v - Math.SQRT1_2) < 1e-5).length;
      const zero = n.filter((v) => v < 1e-5).length;
      if (diagonal === 2 && zero === 1) chamferVertices++;
    }
    expect(chamferVertices).toBe(12 * 2 * 3);
  });

  it("gives a dropped face square edges so the piece butts onto its neighbour", () => {
    const b = createFacetBuilder();
    b.bevelledBox(min, max, bevel, [0.5, 0.5, 0.5], { bottom: false });
    const g = b.build();
    // No bottom face, no bottom chamfers, no bottom corners.
    expect(g.vertexCount / 3).toBe(5 * 2 + 8 * 2 + 4);
    let floorReachX = 0;
    let floorReachZ = 0;
    for (let i = 0; i < g.vertexCount; i++) {
      const p = vertex(g, i);
      expect(normal(g, i)[1]).toBeGreaterThan(-1e-9);
      if (Math.abs(p[1] - min[1]) < 1e-9) {
        floorReachX = Math.max(floorReachX, Math.abs(p[0]));
        floorReachZ = Math.max(floorReachZ, Math.abs(p[2]));
      }
    }
    // The side faces reach the floor at the full footprint, not inset by the bevel.
    expect(floorReachX).toBe(1);
    expect(floorReachZ).toBe(2);
  });

  it("drops any of the six faces", () => {
    const b = createFacetBuilder();
    b.bevelledBox(min, max, bevel, [0.5, 0.5, 0.5], { back: false, top: false });
    const g = b.build();
    expect(g.vertexCount / 3).toBe(4 * 2 + 5 * 2 + 2);
    for (let i = 0; i < g.vertexCount; i++) {
      expect(normal(g, i)[2]).toBeGreaterThan(-1e-9);
      expect(normal(g, i)[1]).toBeLessThan(1e-9);
    }
  });
});

describe("lathe", () => {
  /** A unit sphere's profile from the bottom pole to the top pole. */
  const sphereProfile = (steps: number): [number, number][] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const theta = Math.PI - (Math.PI * i) / steps;
      return [Math.sin(theta), Math.cos(theta)];
    });

  it("spins a profile about Y with shared unit normals that point outwards", () => {
    const b = createFacetBuilder();
    b.lathe(sphereProfile(6), 8, [1, 1, 1]);
    const g = b.build();
    // 2 pole fans of 8 plus 4 bands of 16.
    expect(g.vertexCount / 3).toBe(8 * 2 + 4 * 16);
    expectUnitNormals(g);
    expectNoDegenerateTriangles(g);
    const seen = new Map<string, Vec3>();
    for (let i = 0; i < g.vertexCount; i++) {
      const p = vertex(g, i);
      const n = normal(g, i);
      expect(dot(n, p)).toBeGreaterThan(0.9);
      const key = positionKey(p);
      const prior = seen.get(key);
      if (prior) for (let k = 0; k < 3; k++) expect(n[k]).toBeCloseTo(prior[k], 6);
      else seen.set(key, n);
    }
    // Every triangle is wound the way its normals face.
    for (let t = 0; t < g.vertexCount / 3; t++) {
      const face = triangleNormal(g.positions, t);
      expect(dot(face, normal(g, t * 3))).toBeGreaterThan(0);
    }
  });

  it("treats a repeated profile point as a crease, so a flat end stays flat", () => {
    const b = createFacetBuilder();
    // A closed cylinder: bottom disc, wall, top disc.
    b.lathe(
      [
        [0, 0],
        [1, 0],
        [1, 0],
        [1, 2],
        [1, 2],
        [0, 2],
      ],
      6,
      [1, 1, 1]
    );
    const g = b.build();
    expect(g.vertexCount / 3).toBe(6 + 12 + 6);
    for (let i = 0; i < g.vertexCount; i++) {
      const p = vertex(g, i);
      const n = normal(g, i);
      const onWall = Math.abs(Math.hypot(p[0], p[2]) - 1) < 1e-5;
      if (onWall && p[1] > 0 && p[1] < 2) expect(Math.abs(n[1])).toBeLessThan(1e-9);
      if (!onWall) expect(Math.abs(n[1])).toBeCloseTo(1, 6);
    }
  });

  it("builds a dome as a lathe with its pole up and an open base", () => {
    const b = createFacetBuilder();
    b.dome(1, 0.5, 8, 3, [1, 1, 1]);
    const g = b.build();
    expect(g.vertexCount / 3).toBe(8 + 2 * 16);
    let maxY = 0;
    for (let i = 0; i < g.vertexCount; i++) {
      const p = vertex(g, i);
      maxY = Math.max(maxY, p[1]);
      expect(p[1]).toBeGreaterThanOrEqual(0);
      expect(normal(g, i)[1]).toBeGreaterThan(-1e-9);
    }
    expect(maxY).toBeCloseTo(0.5, 6);
  });
});

describe("smoothNormals", () => {
  it("averages the face normals at coincident positions in a range", () => {
    const b = createFacetBuilder();
    b.box([-1, -1, -1], [1, 1, 1], [1, 1, 1]);
    b.smoothNormals(0, b.vertexCount());
    const g = b.build();
    expectUnitNormals(g);
    for (let i = 0; i < g.vertexCount; i++) {
      const p = vertex(g, i);
      const n = normal(g, i);
      // A cube corner's three face normals average to the corner's own direction.
      for (let k = 0; k < 3; k++) expect(n[k]).toBeCloseTo(p[k] / Math.sqrt(3), 5);
    }
  });

  it("leaves vertices outside the range flat", () => {
    const b = createFacetBuilder();
    b.box([-1, -1, -1], [1, 1, 1], [1, 1, 1]);
    const second = b.vertexCount();
    b.box([2, -1, -1], [4, 1, 1], [1, 1, 1]);
    b.smoothNormals(second, b.vertexCount());
    const g = b.build();
    for (let i = 0; i < second; i++) {
      const n = normal(g, i).map(Math.abs);
      expect(Math.max(...n)).toBeCloseTo(1, 6);
    }
  });

  it("keeps edges sharper than the crease angle hard", () => {
    const b = createFacetBuilder();
    b.box([-1, -1, -1], [1, 1, 1], [1, 1, 1]);
    b.smoothNormals(0, b.vertexCount(), 60);
    const g = b.build();
    for (let i = 0; i < g.vertexCount; i++) {
      const n = normal(g, i).map(Math.abs);
      expect(Math.max(...n)).toBeCloseTo(1, 6);
    }
  });
});

describe("bakeAmbientOcclusion", () => {
  it("darkens the ground contact more than the top, keeping colours in [0, 1]", () => {
    const b = createFacetBuilder();
    b.box([-1, 0, -1], [1, 2, 1], [0.8, 0.7, 0.6]);
    b.bakeAmbientOcclusion({ groundHeight: 1, groundStrength: 0.5 });
    const g = b.build();
    let ground: Vec3 | undefined;
    let top: Vec3 | undefined;
    for (let i = 0; i < g.vertexCount; i++) {
      const c = color(g, i);
      for (const v of c) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      const y = vertex(g, i)[1];
      if (y === 0) ground = c;
      if (y === 2) top = c;
    }
    expect(ground).toBeDefined();
    expect(top).toBeDefined();
    expect(ground![0]).toBeCloseTo(0.4, 6);
    expect(top![0]).toBeCloseTo(0.8, 6);
    expect(top![1]).toBeCloseTo(0.7, 6);
  });

  it("darkens a vertex whose normal points back towards the centroid", () => {
    const b = createFacetBuilder();
    const inward: Vec3 = [-1, 0, 0];
    const outward: Vec3 = [1, 0, 0];
    b.triangleWithNormals([1, 1, 0], [1, 1, 1], [1, 2, 0], inward, inward, inward, [0.5, 0.5, 0.5]);
    b.triangleWithNormals([1, 1, 0], [1, 1, 1], [1, 2, 0], outward, outward, outward, [0.5, 0.5, 0.5]);
    b.bakeAmbientOcclusion({ groundHeight: 0, groundStrength: 0, concavityStrength: 0.6, centroid: [0, 1.5, 0.5] });
    const g = b.build();
    expect(color(g, 0)[0]).toBeLessThan(0.5);
    expect(color(g, 3)[0]).toBeCloseTo(0.5, 6);
  });

  it("darkens the band just under an overhang, but not the surface on top of it", () => {
    const b = createFacetBuilder();
    b.box([-1, 0, -1], [1, 2, 1], [1, 1, 1]);
    b.bakeAmbientOcclusion({ groundHeight: 0, groundStrength: 0, overhangs: [{ y: 2, reach: 1, strength: 0.5 }] });
    const g = b.build();
    for (let i = 0; i < g.vertexCount; i++) {
      const [, y] = vertex(g, i);
      const n = normal(g, i);
      const c = color(g, i)[0];
      if (n[1] > 0.5) expect(c).toBeCloseTo(1, 6);
      else if (y === 2) expect(c).toBeCloseTo(0.5, 6);
      else expect(c).toBeCloseTo(1, 6);
    }
  });

  it("limits itself to a vertex range", () => {
    const b = createFacetBuilder();
    b.box([-1, 0, -1], [1, 2, 1], [1, 1, 1]);
    const from = b.vertexCount();
    b.box([2, 0, -1], [4, 2, 1], [1, 1, 1]);
    b.bakeAmbientOcclusion({ groundHeight: 1, groundStrength: 0.5, from, to: b.vertexCount() });
    const g = b.build();
    for (let i = 0; i < from; i++) expect(color(g, i)[0]).toBeCloseTo(1, 6);
  });
});

describe("jitterColors", () => {
  const build = (seed: number) => {
    const b = createFacetBuilder();
    b.box([-1, 0, -1], [1, 2, 1], [0.5, 0.6, 0.7]);
    b.jitterColors(0.1, seed);
    return b.build();
  };

  it("is deterministic for a seed and differs between seeds", () => {
    expect(build(7).colors).toEqual(build(7).colors);
    expect(build(7).colors).not.toEqual(build(8).colors);
  });

  it("stays within the amount of the original colour, same factor on every channel, and varies", () => {
    const g = build(7);
    const factors = new Set<number>();
    for (let i = 0; i < g.vertexCount; i++) {
      const c = color(g, i);
      const f = c[0] / 0.5;
      expect(Math.abs(f - 1)).toBeLessThanOrEqual(0.1 + 1e-6);
      expect(c[1] / 0.6).toBeCloseTo(f, 5);
      expect(c[2] / 0.7).toBeCloseTo(f, 5);
      factors.add(Math.round(f * 1e4));
    }
    expect(factors.size).toBeGreaterThan(3);
  });

  it("gives coincident positions the same jitter, so faces stay continuous", () => {
    const g = build(7);
    const seen = new Map<string, number>();
    for (let i = 0; i < g.vertexCount; i++) {
      const key = positionKey(vertex(g, i));
      const c = color(g, i)[0];
      const prior = seen.get(key);
      if (prior !== undefined) expect(c).toBeCloseTo(prior, 6);
      else seen.set(key, c);
    }
  });

  it("clamps to [0, 1]", () => {
    const b = createFacetBuilder();
    b.box([-1, 0, -1], [1, 2, 1], [1, 1, 1]);
    b.jitterColors(0.5, 3);
    const g = b.build();
    for (let i = 0; i < g.vertexCount; i++) for (const v of color(g, i)) expect(v).toBeLessThanOrEqual(1);
  });
});

describe("tintColors", () => {
  it("multiplies each vertex colour by a per-channel factor of its position, within a range, clamped", () => {
    const b = createFacetBuilder();
    b.box([0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5]);
    const from = b.vertexCount();
    b.box([0, 0, 0], [1, 2, 1], [0.5, 0.5, 0.5]);
    // Dark and green at the ground, untouched at y = 1 and above.
    b.tintColors(from, b.vertexCount(), ([, y]) => {
      const t = Math.max(0, 1 - y);
      return [1 - 0.5 * t, 1 - 0.2 * t, 1 - 0.5 * t];
    });
    const g = b.build();
    for (let i = 0; i < from; i++) expect(color(g, i)).toEqual([0.5, 0.5, 0.5]);
    for (let i = from; i < g.vertexCount; i++) {
      const y = g.positions[i * 3 + 1];
      const c = color(g, i);
      if (y === 0) {
        expect(c[0]).toBeCloseTo(0.25, 6);
        expect(c[1]).toBeCloseTo(0.4, 6);
      } else expect(c).toEqual([0.5, 0.5, 0.5]);
    }
    b.tintColors(0, from, () => [3, 3, 3]);
    for (let i = 0; i < from; i++) for (const v of color(b.build(), i)) expect(v).toBe(1);
  });
});

describe("rotate and translate", () => {
  it("turns a vertex range about an axis, normals included, and moves it", () => {
    const b = createFacetBuilder();
    b.box([0, 0, 0], [1, 1, 1], [1, 1, 1]);
    const from = b.vertexCount();
    b.box([0, 0, 0], [2, 1, 1], [1, 1, 1]);
    b.rotate(from, b.vertexCount(), "z", Math.PI / 2);
    b.translate(from, b.vertexCount(), [0, 0, 5]);
    const g = b.build();
    expectUnitNormals(g);
    // The first box is untouched.
    for (let i = 0; i < from; i++) expect(vertex(g, i)[2]).toBeLessThanOrEqual(1);
    // The second now stands up to y = 2 inside x in [-1, 0], shifted to z in [5, 6].
    for (let i = from; i < g.vertexCount; i++) {
      const [x, y, z] = vertex(g, i);
      expect(x).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(x).toBeLessThanOrEqual(1e-9);
      expect(y).toBeLessThanOrEqual(2 + 1e-9);
      expect(z).toBeGreaterThanOrEqual(5 - 1e-9);
      // Each stored normal still matches its face.
    }
    for (let t = from / 3; t < g.vertexCount / 3; t++) {
      const n = triangleNormal(g.positions, t);
      expect(dot(n, normal(g, t * 3))).toBeCloseTo(1, 5);
    }
  });
});

describe("shear", () => {
  it("leans a vertex range: one coordinate shifts in proportion to another, and the normals follow exactly", () => {
    const b = createFacetBuilder();
    b.box([0, 0, 0], [1, 1, 1], [1, 1, 1]);
    const from = b.vertexCount();
    b.box([-1, 0, -1], [1, 2, 1], [1, 1, 1]);
    b.shear(from, b.vertexCount(), "x", "y", 0.5);
    const g = b.build();
    expectUnitNormals(g);
    for (let i = 0; i < from; i++) expect(vertex(g, i)[0]).toBeLessThanOrEqual(1);
    // The top of the second box has moved +x by half its height; the bottom has not.
    for (let i = from; i < g.vertexCount; i++) {
      const [x, y] = vertex(g, i);
      if (y === 0) expect(Math.abs(x)).toBe(1);
      if (y === 2) expect(x === 0 || x === 2).toBe(true);
    }
    // Every stored normal still matches its (now tilted) face: a leaning wall faces a little up or down.
    for (let t = from / 3; t < g.vertexCount / 3; t++) {
      const n = triangleNormal(g.positions, t);
      expect(dot(n, normal(g, t * 3))).toBeCloseTo(1, 6);
    }
  });
});

describe("outwardQuad and outwardTriangle", () => {
  it("wind a face away from a centre whichever way its corners are listed", () => {
    const b = createFacetBuilder();
    const centre: Vec3 = [0, 0, 0];
    b.outwardQuad([1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1], centre, [1, 1, 1]);
    b.outwardQuad([1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1], centre, [1, 1, 1]);
    b.outwardTriangle([-1, -1, 0], [-1, 1, 0], [-1, 0, 1], centre, [1, 1, 1]);
    b.outwardTriangle([-1, -1, 0], [-1, 0, 1], [-1, 1, 0], centre, [1, 1, 1]);
    const g = b.build();
    expect(g.vertexCount).toBe(4 * 3 + 2 * 3);
    for (let i = 0; i < 12; i++) expect(normal(g, i)[0]).toBeCloseTo(1, 6);
    for (let i = 12; i < 18; i++) expect(normal(g, i)[0]).toBeCloseTo(-1, 6);
  });
});
