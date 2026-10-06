import { describe, it, expect } from "vitest";
import type { FacetGeometryData } from "./facetBuilder";
import { ROCK_UNIT_RADIUS, ROCK_VARIANT_COUNT } from "./rockGeometry";
import { buildRockGeometryV2, ROCK_V2_TRIANGLE_BUDGET, ROCK_V2_TRIANGLES } from "./rockGeometryV2";

const variants: FacetGeometryData[] = Array.from({ length: ROCK_VARIANT_COUNT }, (_, i) => buildRockGeometryV2(i));

type Vec3 = [number, number, number];
const vertex = (g: FacetGeometryData, i: number): Vec3 => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
const normal = (g: FacetGeometryData, i: number): Vec3 => [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]];
const luminance = (g: FacetGeometryData, i: number) => (g.colors[i * 3] + g.colors[i * 3 + 1] + g.colors[i * 3 + 2]) / 3;

function faceNormal(g: FacetGeometryData, t: number): Vec3 {
  const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const len = Math.hypot(...n);
  return [n[0] / len, n[1] / len, n[2] / len];
}

describe("buildRockGeometryV2", () => {
  it("records each variant's triangle count under the budget", () => {
    expect(ROCK_V2_TRIANGLE_BUDGET).toBeLessThanOrEqual(100);
    variants.forEach((g, i) => {
      expect(g.vertexCount % 3).toBe(0);
      expect(g.vertexCount / 3).toBe(ROCK_V2_TRIANGLES[i]);
      expect(g.vertexCount / 3).toBeLessThanOrEqual(ROCK_V2_TRIANGLE_BUDGET);
    });
  });

  it("carries unit normals and a colour per vertex, with no degenerate faces", () => {
    for (const g of variants) {
      expect(g.colors).toHaveLength(g.vertexCount * 3);
      for (let i = 0; i < g.vertexCount; i++) expect(Math.hypot(...normal(g, i))).toBeCloseTo(1, 5);
      for (let t = 0; t < g.vertexCount / 3; t++) expect(Number.isFinite(faceNormal(g, t)[0])).toBe(true);
    }
  });

  it("winds every face outwards and keeps the vertex normals on the face's side", () => {
    for (const g of variants) {
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const n = faceNormal(g, t);
        const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
        const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
        expect(centroid[0] * n[0] + centroid[1] * n[1] + centroid[2] * n[2]).toBeGreaterThan(0);
        for (let k = 0; k < 3; k++) {
          const m = normal(g, t * 3 + k);
          expect(m[0] * n[0] + m[1] * n[1] + m[2] * n[2]).toBeGreaterThan(0.3);
        }
      }
    }
  });

  it("shades the bulk smoothly: most band vertices no longer carry their face normal, the crown still does", () => {
    for (const g of variants) {
      let smoothed = 0;
      let crownFlat = 0;
      let crown = 0;
      let bulk = 0;
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const n = faceNormal(g, t);
        const touchesTop = [0, 1, 2].some((k) => vertex(g, t * 3 + k)[1] > 0.9 * topY(g));
        for (let k = 0; k < 3; k++) {
          const m = normal(g, t * 3 + k);
          const flat = m[0] * n[0] + m[1] * n[1] + m[2] * n[2] > 1 - 1e-5;
          if (touchesTop) {
            crown++;
            if (flat) crownFlat++;
          } else {
            bulk++;
            if (!flat) smoothed++;
          }
        }
      }
      expect(smoothed / bulk).toBeGreaterThan(0.5);
      expect(crownFlat / crown).toBeGreaterThan(0.5);
    }
  });

  it("bakes ambient occlusion: the buried base is darker than the crown, colours in [0, 1]", () => {
    for (const g of variants) {
      let base = 0;
      let baseCount = 0;
      let crown = 0;
      let crownCount = 0;
      for (let i = 0; i < g.vertexCount; i++) {
        for (let k = 0; k < 3; k++) {
          expect(g.colors[i * 3 + k]).toBeGreaterThanOrEqual(0);
          expect(g.colors[i * 3 + k]).toBeLessThanOrEqual(1);
        }
        const y = vertex(g, i)[1];
        if (y <= 0) {
          base += luminance(g, i);
          baseCount++;
        } else if (y > 0.6 * topY(g)) {
          crown += luminance(g, i);
          crownCount++;
        }
      }
      expect(base / baseCount).toBeLessThan((crown / crownCount) * 0.85);
      // Near white up top: the instance colour carries the rock's actual colour.
      expect(crown / crownCount).toBeGreaterThan(0.8);
    }
  });

  it("jitters the colours so the surface is not one flat tint", () => {
    for (const g of variants) {
      // Jitter is per position; the visible part has a few dozen of them.
      const above = new Set<number>();
      for (let i = 0; i < g.vertexCount; i++) if (vertex(g, i)[1] > 0) above.add(Math.round(luminance(g, i) * 1e3));
      expect(above.size).toBeGreaterThan(8);
    }
  });

  it("keeps the faceted rock's local-space contract: buried base, widest ring near the ground", () => {
    for (const g of variants) {
      const ys = Array.from({ length: g.vertexCount }, (_, i) => g.positions[i * 3 + 1]);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      expect(minY).toBeLessThan(-0.2 * ROCK_UNIT_RADIUS);
      expect(-minY).toBeLessThan(maxY);
      expect(maxY).toBeGreaterThan(0.5 * ROCK_UNIT_RADIUS);
      let widest = 0;
      for (let i = 0; i < g.vertexCount; i++) {
        const [x, , z] = vertex(g, i);
        widest = Math.max(widest, Math.hypot(x, z));
      }
      expect(widest).toBeGreaterThan(0.8 * ROCK_UNIT_RADIUS);
      expect(widest).toBeLessThan(1.6 * ROCK_UNIT_RADIUS);
    }
  });

  it("is deterministic, wraps the index and differs between variants", () => {
    expect(buildRockGeometryV2(1).positions).toEqual(variants[1].positions);
    expect(buildRockGeometryV2(1).colors).toEqual(variants[1].colors);
    expect(buildRockGeometryV2(ROCK_VARIANT_COUNT).positions).toEqual(variants[0].positions);
    expect(new Set(variants.map((g) => g.vertexCount)).size).toBe(ROCK_VARIANT_COUNT);
  });
});

function topY(g: FacetGeometryData): number {
  let maxY = -Infinity;
  for (let i = 0; i < g.vertexCount; i++) maxY = Math.max(maxY, g.positions[i * 3 + 1]);
  return maxY;
}
