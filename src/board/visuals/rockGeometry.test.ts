import { describe, it, expect } from "vitest";
import {
  buildRockGeometry,
  ROCK_TRIANGLE_BUDGET,
  ROCK_UNIT_RADIUS,
  ROCK_VARIANT_COUNT,
  type RockGeometryData,
} from "./rockGeometry";

const variants: RockGeometryData[] = Array.from({ length: ROCK_VARIANT_COUNT }, (_, i) => buildRockGeometry(i));

function vertex(g: RockGeometryData, i: number): [number, number, number] {
  return [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
}

describe("buildRockGeometry", () => {
  it("offers three variants", () => {
    expect(ROCK_VARIANT_COUNT).toBe(3);
  });

  it("builds flat-shaded non-degenerate triangles with unit normals", () => {
    for (const g of variants) {
      expect(g.vertexCount % 3).toBe(0);
      expect(g.positions).toHaveLength(g.vertexCount * 3);
      expect(g.normals).toHaveLength(g.vertexCount * 3);
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ];
        const area = Math.hypot(n[0], n[1], n[2]) / 2;
        expect(area).toBeGreaterThan(1e-6);
        // Every vertex of the face carries the same face normal (flat shading).
        for (let k = 0; k < 3; k++) {
          const i = t * 3 + k;
          const stored = [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]];
          expect(Math.hypot(...stored)).toBeCloseTo(1, 5);
          const dot = (stored[0] * n[0] + stored[1] * n[1] + stored[2] * n[2]) / (area * 2);
          expect(dot).toBeCloseTo(1, 5);
        }
      }
    }
  });

  it("winds every face outwards (normals point away from the centre)", () => {
    for (const g of variants) {
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
        const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
        const i = t * 3;
        const dot = centroid[0] * g.normals[i * 3] + centroid[1] * g.normals[i * 3 + 1] + centroid[2] * g.normals[i * 3 + 2];
        expect(dot).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every variant's triangle count under the budget", () => {
    for (const g of variants) {
      expect(g.vertexCount / 3).toBeLessThanOrEqual(ROCK_TRIANGLE_BUDGET);
      expect(g.vertexCount / 3).toBeGreaterThanOrEqual(24);
    }
  });

  it("buries every variant's base: its lowest vertices sit below y = 0", () => {
    for (const g of variants) {
      const ys = Array.from({ length: g.vertexCount }, (_, i) => g.positions[i * 3 + 1]);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      expect(minY).toBeLessThan(-0.2 * ROCK_UNIT_RADIUS);
      // The buried part is shallower than the visible part.
      expect(-minY).toBeLessThan(maxY);
      expect(maxY).toBeGreaterThan(0.5 * ROCK_UNIT_RADIUS);
    }
  });

  it("sits its widest part near ground level, about a unit rock radius across", () => {
    for (const g of variants) {
      let widest = 0;
      for (let i = 0; i < g.vertexCount; i++) {
        const [x, , z] = vertex(g, i);
        widest = Math.max(widest, Math.hypot(x, z));
      }
      expect(widest).toBeGreaterThan(0.8 * ROCK_UNIT_RADIUS);
      expect(widest).toBeLessThan(1.6 * ROCK_UNIT_RADIUS);
    }
  });

  it("is deterministic", () => {
    expect(buildRockGeometry(1).positions).toEqual(buildRockGeometry(1).positions);
  });

  it("builds variants that differ from each other", () => {
    for (let i = 0; i < ROCK_VARIANT_COUNT; i++) {
      for (let j = i + 1; j < ROCK_VARIANT_COUNT; j++) {
        const a = variants[i];
        const b = variants[j];
        if (a.vertexCount === b.vertexCount) {
          let maxDiff = 0;
          for (let k = 0; k < a.positions.length; k++) maxDiff = Math.max(maxDiff, Math.abs(a.positions[k] - b.positions[k]));
          expect(maxDiff).toBeGreaterThan(0.01 * ROCK_UNIT_RADIUS);
        } else {
          expect(a.vertexCount).not.toBe(b.vertexCount);
        }
      }
    }
  });

  it("jitters its vertices so no variant is a plain lattice", () => {
    for (const g of variants) {
      // Radii of the vertices in the widest ring vary noticeably.
      const radii: number[] = [];
      for (let i = 0; i < g.vertexCount; i++) {
        const [x, y, z] = vertex(g, i);
        if (Math.abs(y) < 0.35 * ROCK_UNIT_RADIUS) radii.push(Math.hypot(x, z));
      }
      expect(radii.length).toBeGreaterThan(3);
      expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.1 * ROCK_UNIT_RADIUS);
    }
  });

  it("wraps an out-of-range variant index round", () => {
    expect(buildRockGeometry(ROCK_VARIANT_COUNT).positions).toEqual(buildRockGeometry(0).positions);
  });
});
