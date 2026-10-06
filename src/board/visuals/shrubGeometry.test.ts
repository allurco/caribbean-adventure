import { describe, it, expect } from "vitest";
import {
  buildShrubGeometry,
  SHRUB_FOOTPRINT_RADIUS,
  SHRUB_HEIGHT,
  SHRUB_KINDS,
  SHRUB_MAX_SWAY,
  SHRUB_TRIANGLE_BUDGET,
  type ShrubColors,
  type ShrubGeometryData,
  type ShrubKind,
} from "./shrubGeometry";

const COLORS: ShrubColors = {
  stem: [0.25, 0.15, 0.07],
  foliage: [0.12, 0.3, 0.06],
};

interface Vertex {
  x: number;
  y: number;
  z: number;
  sway: number;
  crown: number;
  r: number;
  g: number;
  b: number;
}

function verticesOf(data: ShrubGeometryData): Vertex[] {
  return Array.from({ length: data.vertexCount }, (_, i) => ({
    x: data.positions[i * 3],
    y: data.positions[i * 3 + 1],
    z: data.positions[i * 3 + 2],
    sway: data.palm[i * 2],
    crown: data.palm[i * 2 + 1],
    r: data.colors[i * 3],
    g: data.colors[i * 3 + 1],
    b: data.colors[i * 3 + 2],
  }));
}

const quadrant = (v: { x: number; z: number }) => `${v.x >= 0 ? "+" : "-"}${v.z >= 0 ? "+" : "-"}`;
const greenish = (v: Vertex) => v.g > v.r && v.g > v.b;

const built: Record<ShrubKind, ShrubGeometryData> = {
  bush: buildShrubGeometry("bush", COLORS),
  tuft: buildShrubGeometry("tuft", COLORS),
};

describe("buildShrubGeometry", () => {
  it("builds two kinds: a bush cluster for grass and a dry tuft for sand", () => {
    expect(SHRUB_KINDS).toEqual(["bush", "tuft"]);
  });

  describe.each(SHRUB_KINDS)("%s", (kind) => {
    const data = built[kind];
    const n = data.vertexCount;
    const vertices = verticesOf(data);
    const base = vertices.filter((v) => Math.abs(v.y) < 1e-6);

    it("returns non-indexed triangles with matching attribute lengths", () => {
      expect(n % 3).toBe(0);
      expect(data.positions).toHaveLength(n * 3);
      expect(data.normals).toHaveLength(n * 3);
      expect(data.colors).toHaveLength(n * 3);
      expect(data.palm).toHaveLength(n * 2);
    });

    it("stays within the triangle budget: these are instanced in the hundreds", () => {
      expect(SHRUB_TRIANGLE_BUDGET).toBeLessThanOrEqual(100);
      expect(n / 3).toBeLessThanOrEqual(SHRUB_TRIANGLE_BUDGET);
      expect(n / 3).toBeGreaterThan(20);
    });

    it("is deterministic", () => {
      expect(buildShrubGeometry(kind, COLORS)).toEqual(data);
    });

    it("stands on y = 0 at the origin and never goes below the ground", () => {
      expect(Math.min(...vertices.map((v) => v.y))).toBeCloseTo(0, 6);
      expect(base.length).toBeGreaterThan(2);
      for (const v of base) expect(Math.hypot(v.x, v.z)).toBeLessThan(SHRUB_FOOTPRINT_RADIUS[kind]);
    });

    it("reaches its nominal height, within a little jitter", () => {
      const top = Math.max(...vertices.map((v) => v.y));
      expect(top).toBeGreaterThan(SHRUB_HEIGHT[kind] * 0.9);
      expect(top).toBeLessThan(SHRUB_HEIGHT[kind] * 1.15);
    });

    it("keeps every vertex inside its footprint radius", () => {
      for (const v of vertices) expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(SHRUB_FOOTPRINT_RADIUS[kind] + 1e-6);
    });

    it("spreads round the origin rather than leaning one way", () => {
      const upper = vertices.filter((v) => v.y > SHRUB_HEIGHT[kind] * 0.4);
      expect(new Set(upper.map(quadrant)).size).toBe(4);
    });

    it("carries the palm sway attribute: 0 at the base, rising with height to the kind's maximum", () => {
      for (const v of vertices) {
        expect(v.sway).toBeGreaterThanOrEqual(0);
        expect(v.sway).toBeLessThanOrEqual(SHRUB_MAX_SWAY[kind]);
      }
      for (const v of base) expect(v.sway).toBe(0);
      const max = Math.max(...vertices.map((v) => v.sway));
      expect(max).toBeGreaterThan(SHRUB_MAX_SWAY[kind] * 0.8);
      // Monotone in height: anything above the lower third sways more than anything in the bottom tenth.
      const low = vertices.filter((v) => v.y < SHRUB_HEIGHT[kind] * 0.1);
      const high = vertices.filter((v) => v.y > SHRUB_HEIGHT[kind] * 0.35);
      expect(high.length).toBeGreaterThan(0);
      expect(Math.max(...low.map((v) => v.sway))).toBeLessThan(Math.min(...high.map((v) => v.sway)));
    });

    it("sways less than a palm frond tip so a low plant does not whip", () => {
      expect(SHRUB_MAX_SWAY[kind]).toBeLessThan(0.75);
    });

    it("sets the crown mask to 0 everywhere: no palm crown twist or frond flutter", () => {
      for (const v of vertices) expect(v.crown).toBe(0);
    });

    it("has unit normals and no degenerate triangles", () => {
      for (let i = 0; i < n; i++) {
        const len = Math.hypot(data.normals[i * 3], data.normals[i * 3 + 1], data.normals[i * 3 + 2]);
        expect(len).toBeCloseTo(1, 5);
      }
    });

    it("keeps colours in [0, 1]", () => {
      for (let i = 0; i < n * 3; i++) {
        expect(data.colors[i]).toBeGreaterThanOrEqual(0);
        expect(data.colors[i]).toBeLessThanOrEqual(1);
      }
    });

    it("paints the swaying parts with the foliage colour; the stem-coloured base holds still", () => {
      const foliage = vertices.filter((v) => v.sway > SHRUB_MAX_SWAY[kind] * 0.5);
      expect(foliage.length).toBeGreaterThan(0);
      for (const v of foliage) expect(greenish(v)).toBe(true);
      const stem = vertices.filter((v) => !greenish(v));
      expect(stem.length).toBeGreaterThan(0);
      for (const v of stem) expect(v.sway).toBeLessThan(SHRUB_MAX_SWAY[kind] * 0.3);
    });

    it("shades the foliage lighter towards the top", () => {
      const foliage = vertices.filter((v) => greenish(v));
      const lum = (v: Vertex) => 0.2126 * v.r + 0.7152 * v.g + 0.0722 * v.b;
      const low = foliage.filter((v) => v.y < SHRUB_HEIGHT[kind] * 0.5);
      const high = foliage.filter((v) => v.y > SHRUB_HEIGHT[kind] * 0.85);
      expect(low.length).toBeGreaterThan(0);
      expect(high.length).toBeGreaterThan(0);
      const mean = (vs: Vertex[]) => vs.reduce((s, v) => s + lum(v), 0) / vs.length;
      expect(mean(high)).toBeGreaterThan(mean(low));
    });
  });

  it("makes the bush a knee-high cluster, 0.1 to 0.2 units tall, and the tuft lower", () => {
    expect(SHRUB_HEIGHT.bush).toBeGreaterThanOrEqual(0.1);
    expect(SHRUB_HEIGHT.bush).toBeLessThanOrEqual(0.2);
    expect(SHRUB_HEIGHT.tuft).toBeLessThan(SHRUB_HEIGHT.bush);
    expect(SHRUB_HEIGHT.tuft).toBeGreaterThanOrEqual(0.06);
  });

  it("builds the bush from several overlapping blobs on a short stem", () => {
    const vertices = verticesOf(built.bush);
    // Blob tops are local maxima of y among the foliage; count distinct ones.
    const foliage = vertices.filter(greenish);
    const tops = foliage.filter((v) => v.y > SHRUB_HEIGHT.bush * 0.55);
    const clusters = new Set(tops.map((v) => `${Math.round(v.x * 25)},${Math.round(v.z * 25)}`));
    expect(clusters.size).toBeGreaterThanOrEqual(3);
    // The stem is the still, stem-coloured part and it is narrow.
    const stem = vertices.filter((v) => !greenish(v));
    expect(stem.length).toBeGreaterThan(0);
    for (const v of stem) expect(Math.hypot(v.x, v.z)).toBeLessThan(0.03);
  });

  it("builds the tuft from sparse spiky blades splaying out from a low mound", () => {
    const vertices = verticesOf(built.tuft);
    const tips = vertices.filter((v) => v.y > SHRUB_HEIGHT.tuft * 0.7);
    expect(tips.length).toBeGreaterThanOrEqual(5);
    expect(new Set(tips.map(quadrant)).size).toBe(4);
    // Blades lean outward: tips sit farther from the axis than the roots.
    const roots = vertices.filter((v) => greenish(v) && Math.abs(v.y) < 1e-6);
    const meanRadius = (vs: Vertex[]) => vs.reduce((s, v) => s + Math.hypot(v.x, v.z), 0) / vs.length;
    expect(roots.length).toBeGreaterThan(0);
    expect(meanRadius(tips)).toBeGreaterThan(meanRadius(roots) * 1.5);
    // The mound is low and stem-coloured.
    const mound = vertices.filter((v) => !greenish(v));
    expect(mound.length).toBeGreaterThan(0);
    for (const v of mound) expect(v.y).toBeLessThan(SHRUB_HEIGHT.tuft * 0.25);
  });

  it("gives the bush a wider footprint than the tuft", () => {
    expect(SHRUB_FOOTPRINT_RADIUS.bush).toBeGreaterThan(SHRUB_FOOTPRINT_RADIUS.tuft);
    expect(SHRUB_FOOTPRINT_RADIUS.bush).toBeLessThan(0.2);
  });
});
