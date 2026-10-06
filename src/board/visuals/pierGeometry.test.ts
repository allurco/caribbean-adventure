import { describe, it, expect } from "vitest";
import {
  buildPierGeometry,
  PIER_DECK_TOP,
  PIER_LENGTH,
  PIER_POST_BOTTOM,
  PIER_POST_TOP,
  PIER_TRIANGLE_BUDGET,
  PIER_WIDTH,
  type PierColors,
  type PierGeometryData,
} from "./pierGeometry";
import { SEA_LEVEL } from "./terrainHeightField";

const colors: PierColors = { plank: [0.6, 0.5, 0.4], post: [0.3, 0.22, 0.15] };
const pier = buildPierGeometry(colors);

function vertex(g: PierGeometryData, i: number): [number, number, number] {
  return [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
}
function normal(g: PierGeometryData, i: number): [number, number, number] {
  return [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]];
}
function color(g: PierGeometryData, i: number): [number, number, number] {
  return [g.colors[i * 3], g.colors[i * 3 + 1], g.colors[i * 3 + 2]];
}

describe("buildPierGeometry", () => {
  it("builds flat-shaded non-degenerate triangles with unit face normals and a colour per vertex", () => {
    expect(pier.vertexCount % 3).toBe(0);
    expect(pier.positions).toHaveLength(pier.vertexCount * 3);
    expect(pier.normals).toHaveLength(pier.vertexCount * 3);
    expect(pier.colors).toHaveLength(pier.vertexCount * 3);
    for (let t = 0; t < pier.vertexCount / 3; t++) {
      const [a, b, c] = [vertex(pier, t * 3), vertex(pier, t * 3 + 1), vertex(pier, t * 3 + 2)];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const len = Math.hypot(n[0], n[1], n[2]);
      expect(len).toBeGreaterThan(1e-7);
      for (let k = 0; k < 3; k++) {
        const stored = normal(pier, t * 3 + k);
        expect(Math.hypot(...stored)).toBeCloseTo(1, 5);
        expect((stored[0] * n[0] + stored[1] * n[1] + stored[2] * n[2]) / len).toBeCloseTo(1, 5);
      }
    }
  });

  it("stays within its triangle budget", () => {
    expect(pier.vertexCount / 3).toBeLessThanOrEqual(PIER_TRIANGLE_BUDGET);
    // Posts plus a planked deck: far more than the single box it replaces.
    expect(pier.vertexCount / 3).toBeGreaterThan(60);
  });

  it("runs from the land end at the origin out along +z, and keeps within its width", () => {
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxAbsX = 0;
    for (let i = 0; i < pier.vertexCount; i++) {
      const [x, , z] = vertex(pier, i);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      maxAbsX = Math.max(maxAbsX, Math.abs(x));
    }
    expect(minZ).toBeCloseTo(0, 6);
    expect(maxZ).toBeCloseTo(PIER_LENGTH, 6);
    expect(maxAbsX).toBeCloseTo(PIER_WIDTH / 2, 6);
  });

  it("puts the deck a little above sea level and sinks the posts well below it", () => {
    expect(PIER_DECK_TOP).toBeGreaterThan(SEA_LEVEL + 0.04);
    expect(PIER_DECK_TOP).toBeLessThan(SEA_LEVEL + 0.12);
    expect(PIER_POST_BOTTOM).toBeLessThan(SEA_LEVEL - 0.2);
    expect(PIER_POST_TOP).toBeGreaterThan(PIER_DECK_TOP);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pier.vertexCount; i++) {
      const y = vertex(pier, i)[1];
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    expect(minY).toBeCloseTo(PIER_POST_BOTTOM, 6);
    expect(maxY).toBeCloseTo(PIER_POST_TOP, 6);
  });

  it("faces the deck's top planks upwards", () => {
    let topFaces = 0;
    for (let t = 0; t < pier.vertexCount / 3; t++) {
      const ys = [0, 1, 2].map((k) => vertex(pier, t * 3 + k)[1]);
      if (ys.every((y) => Math.abs(y - PIER_DECK_TOP) < 1e-6)) {
        topFaces++;
        expect(normal(pier, t * 3)[1]).toBeCloseTo(1, 5);
      }
    }
    // Several planks, two triangles each.
    expect(topFaces).toBeGreaterThanOrEqual(8);
  });

  it("colours the deck in the plank colour (banded) and the posts in the post colour", () => {
    const plankish: number[] = [];
    for (let i = 0; i < pier.vertexCount; i++) {
      const [, y] = vertex(pier, i);
      const c = color(pier, i);
      for (const v of c) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      if (Math.abs(y - PIER_DECK_TOP) < 1e-6) plankish.push(c[0] / colors.plank[0]);
      if (y < SEA_LEVEL - 0.1) {
        // Below the water line only posts remain.
        expect(c[0]).toBeCloseTo(colors.post[0], 6);
        expect(c[1]).toBeCloseTo(colors.post[1], 6);
        expect(c[2]).toBeCloseTo(colors.post[2], 6);
      }
    }
    // Alternate planks are shaded, so the deck shows more than one shade of the plank colour.
    expect(new Set(plankish.map((k) => k.toFixed(3))).size).toBeGreaterThanOrEqual(2);
    expect(Math.min(...plankish)).toBeGreaterThan(0.6);
    expect(Math.max(...plankish)).toBeLessThanOrEqual(1 + 1e-6);
  });

  it("is deterministic", () => {
    expect(buildPierGeometry(colors).positions).toEqual(pier.positions);
  });
});
