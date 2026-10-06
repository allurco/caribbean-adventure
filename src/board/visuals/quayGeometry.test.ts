import { describe, it, expect } from "vitest";
import type { FacetGeometryData } from "./facetBuilder";
import { PIER_DECK_TOP, PIER_POST_BOTTOM, PIER_WIDTH } from "./pierGeometry";
import {
  buildQuayGeometry,
  QUAY_BACK,
  QUAY_BASE,
  QUAY_BOLLARD,
  QUAY_COPING_PROUD,
  QUAY_COPING_THICKNESS,
  QUAY_COURSE_COUNT,
  QUAY_COURSE_HEIGHT,
  QUAY_COURSE_LEDGES,
  QUAY_SEA_FACE,
  QUAY_STEP_TOP,
  QUAY_STEP_Z,
  QUAY_TOP,
  QUAY_TRIANGLE_BUDGET,
  QUAY_TRIANGLES,
  QUAY_WIDTH,
  type QuayColors,
} from "./quayGeometry";
import { SEA_LEVEL } from "./terrainHeightField";

const colors: QuayColors = { stone: [0.42, 0.38, 0.32], coping: [0.6, 0.55, 0.47], bollard: [0.12, 0.08, 0.05] };
const quay = buildQuayGeometry(colors);

type Vec3 = [number, number, number];
const vertex = (g: FacetGeometryData, i: number): Vec3 => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
const normal = (g: FacetGeometryData, i: number): Vec3 => [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]];
const color = (g: FacetGeometryData, i: number): Vec3 => [g.colors[i * 3], g.colors[i * 3 + 1], g.colors[i * 3 + 2]];
const luminance = (c: readonly [number, number, number]) => (c[0] + c[1] + c[2]) / 3;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const triangles = (g: FacetGeometryData): Vec3[][] =>
  Array.from({ length: g.vertexCount / 3 }, (_, t) => [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)]);

function faceNormal([a, b, c]: Vec3[]): Vec3 {
  const n = cross(sub(b, a), sub(c, a));
  const len = Math.hypot(...n);
  return [n[0] / len, n[1] / len, n[2] / len];
}

/** Which part a (shaded, jittered) vertex colour came from. */
function partOf(c: Vec3): "stone" | "coping" | "bollard" {
  if (luminance(c) < 0.2) return "bollard";
  // The coping starts well above the stone; occlusion only ever darkens, and the course, block and vertex jitters are small.
  return luminance(c) > (luminance(colors.stone) + luminance(colors.coping)) / 2 ? "coping" : "stone";
}

const EPS = 1e-6;

/**
 * Two coplanar triangles overlap if, projected into their plane, no edge
 * normal separates them by more than a sliver: a shared edge or a touch at a
 * corner is not an overlap.
 */
function coplanarOverlap(p: Vec3[], q: Vec3[], n: Vec3): boolean {
  const axisIndex = [0, 1, 2].reduce((best, k) => (Math.abs(n[k]) > Math.abs(n[best]) ? k : best), 0);
  const [u, v] = [(axisIndex + 1) % 3, (axisIndex + 2) % 3];
  const flat = (tri: Vec3[]) => tri.map((pt) => [pt[u], pt[v]] as [number, number]);
  const a = flat(p);
  const b = flat(q);
  for (const tri of [a, b]) {
    for (let k = 0; k < 3; k++) {
      const [x0, y0] = tri[k];
      const [x1, y1] = tri[(k + 1) % 3];
      const axis = [-(y1 - y0), x1 - x0];
      const project = (t: [number, number][]) => {
        const values = t.map(([x, y]) => x * axis[0] + y * axis[1]);
        return [Math.min(...values), Math.max(...values)];
      };
      const [aMin, aMax] = project(a);
      const [bMin, bMax] = project(b);
      const scale = Math.hypot(axis[0], axis[1]);
      if (Math.min(aMax, bMax) - Math.max(aMin, bMin) <= EPS * scale) return false;
    }
  }
  return true;
}

/** Does the segment a→b pass through the interior of triangle `tri` (Möller–Trumbore, strict)? */
function segmentCrossesTriangle(a: Vec3, b: Vec3, tri: Vec3[]): boolean {
  const dir = sub(b, a);
  const e1 = sub(tri[1], tri[0]);
  const e2 = sub(tri[2], tri[0]);
  const p = cross(dir, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det;
  const s = sub(a, tri[0]);
  const u = dot(s, p) * inv;
  if (u <= EPS || u >= 1 - EPS) return false;
  const q = cross(s, e1);
  const v = dot(dir, q) * inv;
  if (v <= EPS || u + v >= 1 - EPS) return false;
  const t = dot(e2, q) * inv;
  return t > EPS && t < 1 - EPS;
}

describe("the overlap and crossing checks", () => {
  const floor: Vec3[] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 0, 1],
  ];
  it("catch a planted fault and pass a shared edge", () => {
    const shifted: Vec3[] = floor.map(([x, y, z]) => [x + 0.2, y, z + 0.2]);
    expect(coplanarOverlap(floor, shifted, [0, 1, 0])).toBe(true);
    const neighbour: Vec3[] = [
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ];
    expect(coplanarOverlap(floor, neighbour, [0, 1, 0])).toBe(false);
    expect(segmentCrossesTriangle([0.2, -1, 0.2], [0.2, 1, 0.2], floor)).toBe(true);
    // Touching the face at its edge, or lying in its plane, is not a crossing.
    expect(segmentCrossesTriangle([0.5, -1, 0], [0.5, 1, 0], floor)).toBe(false);
    expect(segmentCrossesTriangle([0.1, 0, 0.1], [0.3, 0, 0.3], floor)).toBe(false);
  });
});

describe("buildQuayGeometry", () => {
  it("records its triangle count under the budget", () => {
    expect(quay.vertexCount % 3).toBe(0);
    expect(quay.vertexCount / 3).toBe(QUAY_TRIANGLES);
    expect(QUAY_TRIANGLES).toBeLessThanOrEqual(QUAY_TRIANGLE_BUDGET);
    expect(QUAY_TRIANGLE_BUDGET).toBeLessThanOrEqual(240);
  });

  it("stores unit face normals and a colour per vertex, with no degenerate face", () => {
    expect(quay.colors).toHaveLength(quay.vertexCount * 3);
    triangles(quay).forEach((tri, t) => {
      const n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
      expect(Math.hypot(...n)).toBeGreaterThan(1e-6);
      for (let k = 0; k < 3; k++) {
        const stored = normal(quay, t * 3 + k);
        expect(Math.hypot(...stored)).toBeCloseTo(1, 5);
        expect(dot(stored, faceNormal(tri))).toBeCloseTo(1, 4);
      }
    });
  });

  it("is a platform at the pier root: two to three piers wide, the sea face a little seaward of the origin, deep enough to sit under the beach", () => {
    expect(QUAY_WIDTH).toBeGreaterThanOrEqual(2 * PIER_WIDTH);
    expect(QUAY_WIDTH).toBeLessThanOrEqual(3 * PIER_WIDTH);
    expect(QUAY_SEA_FACE).toBeGreaterThan(0);
    expect(QUAY_SEA_FACE).toBeLessThan(0.06);
    expect(QUAY_BACK).toBeLessThan(-0.2);
    expect(QUAY_BASE).toBeLessThanOrEqual(PIER_POST_BOTTOM);
    let minY = Infinity;
    let maxAbsX = 0;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < quay.vertexCount; i++) {
      const [x, y, z] = vertex(quay, i);
      minY = Math.min(minY, y);
      maxAbsX = Math.max(maxAbsX, Math.abs(x));
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    expect(minY).toBeCloseTo(QUAY_BASE, 6);
    expect(maxAbsX).toBeCloseTo(QUAY_WIDTH / 2 + QUAY_COPING_PROUD, 6);
    expect(minZ).toBeCloseTo(QUAY_BACK, 6);
    // The battered sea wall leans out below the coping, but never past the coping's reach.
    expect(maxZ).toBeLessThanOrEqual(QUAY_SEA_FACE + QUAY_COPING_PROUD + 1e-6);
  });

  it("has a flat top at QUAY_TOP, just above the pier deck, with only the bollards standing on it", () => {
    expect(QUAY_TOP).toBeGreaterThan(PIER_DECK_TOP);
    expect(QUAY_TOP - PIER_DECK_TOP).toBeLessThanOrEqual(0.02);
    expect(QUAY_STEP_TOP).toBeCloseTo(QUAY_TOP - QUAY_COPING_THICKNESS, 6);
    let topFaces = 0;
    let stepFaces = 0;
    triangles(quay).forEach((tri, t) => {
      const n = normal(quay, t * 3);
      const ys = tri.map((p) => p[1]);
      if (n[1] > 0.99) {
        // Every upward face is the deck, the rear step, a course ledge or a bollard's cap.
        if (Math.abs(ys[0] - QUAY_TOP) < 1e-6) topFaces++;
        else if (Math.abs(ys[0] - QUAY_STEP_TOP) < 1e-6) stepFaces++;
        else if (QUAY_COURSE_LEDGES.some((y) => Math.abs(ys[0] - y) < 1e-6)) expect(partOf(color(quay, t * 3))).toBe("stone");
        else expect(partOf(color(quay, t * 3))).toBe("bollard");
        for (const y of ys) expect(y).toBeCloseTo(ys[0], 6);
      }
      for (const [x, y, z] of tri) {
        if (y > QUAY_TOP + 1e-6) {
          expect(partOf(color(quay, t * 3))).toBe("bollard");
          expect(Math.abs(x)).toBeLessThanOrEqual(QUAY_WIDTH / 2);
          expect(z).toBeLessThanOrEqual(QUAY_SEA_FACE);
          expect(y).toBeLessThanOrEqual(QUAY_TOP + QUAY_BOLLARD.height + 1e-6);
        }
      }
    });
    expect(topFaces).toBeGreaterThanOrEqual(2);
    expect(stepFaces).toBe(2);
  });

  it("steps down landward of QUAY_STEP_Z: the deck covers the front, the lower step the back", () => {
    expect(QUAY_STEP_Z).toBeGreaterThan(QUAY_BACK);
    expect(QUAY_STEP_Z).toBeLessThan(0);
    for (const tri of triangles(quay)) {
      const n = faceNormal(tri);
      if (n[1] < 0.99) continue;
      for (const [, y, z] of tri) {
        if (Math.abs(y - QUAY_TOP) < 1e-6) expect(z).toBeGreaterThanOrEqual(QUAY_STEP_Z - 1e-6);
        if (Math.abs(y - QUAY_STEP_TOP) < 1e-6) expect(z).toBeLessThanOrEqual(QUAY_STEP_Z + 1e-6);
      }
    }
  });

  it("bevels the coping: lighter facets at 45 degrees along its top edges", () => {
    let chamfers = 0;
    for (let t = 0; t < quay.vertexCount / 3; t++) {
      const n = normal(quay, t * 3);
      if (partOf(color(quay, t * 3)) !== "coping") continue;
      const y = vertex(quay, t * 3)[1];
      if (Math.abs(n[1] - Math.SQRT1_2) < 1e-4 && y > QUAY_STEP_TOP) chamfers++;
    }
    // Front, back and both sides, two triangles each.
    expect(chamfers).toBeGreaterThanOrEqual(8);
  });

  it("lays the wall above the waterline in stepped courses: a ledge at each course line, out to the coping's edge at the foot", () => {
    expect(QUAY_COURSE_COUNT).toBeGreaterThanOrEqual(3);
    expect(QUAY_COURSE_LEDGES).toHaveLength(QUAY_COURSE_COUNT);
    expect(QUAY_COURSE_LEDGES[0]).toBeCloseTo(SEA_LEVEL, 9);
    expect(QUAY_COURSE_LEDGES[QUAY_COURSE_COUNT - 1]).toBeLessThan(QUAY_STEP_TOP - 0.01);
    const tris = triangles(quay);
    for (const y of QUAY_COURSE_LEDGES) {
      let frontLedges = 0;
      tris.forEach((tri, t) => {
        if (partOf(color(quay, t * 3)) !== "stone" || normal(quay, t * 3)[1] < 0.99) return;
        if (tri.every((p) => Math.abs(p[1] - y) < 1e-6) && tri.every((p) => p[2] > QUAY_SEA_FACE - 1e-6)) frontLedges++;
      });
      expect(frontLedges, `front ledge at ${y}`).toBe(2);
    }
    // Each course's face is vertical; the courses step out going down, the lowest flush with the coping's edge.
    let footZ = -Infinity;
    let topCourseZ = -Infinity;
    for (let i = 0; i < quay.vertexCount; i++) {
      const [, y, z] = vertex(quay, i);
      const n = normal(quay, i);
      if (partOf(color(quay, i)) !== "stone" || n[2] < 0.99) continue;
      expect(Math.abs(n[1])).toBeLessThan(1e-6);
      if (Math.abs(y - SEA_LEVEL) < 1e-6) footZ = Math.max(footZ, z);
      if (Math.abs(y - QUAY_STEP_TOP) < 1e-6) topCourseZ = Math.max(topCourseZ, z);
    }
    expect(footZ).toBeCloseTo(QUAY_SEA_FACE + QUAY_COPING_PROUD, 6);
    expect(topCourseZ).toBeCloseTo(QUAY_SEA_FACE, 6);
  });

  it("alternates the courses in tone and staggers the block joints on the front face", () => {
    const tris = triangles(quay);
    const sums = Array.from({ length: QUAY_COURSE_COUNT }, () => ({ light: 0, count: 0, xs: new Set<number>() }));
    tris.forEach((tri, t) => {
      if (partOf(color(quay, t * 3)) !== "stone" || normal(quay, t * 3)[2] < 0.99) return;
      const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      if (cy < SEA_LEVEL) return;
      const course = Math.min(QUAY_COURSE_COUNT - 1, Math.floor((cy - SEA_LEVEL) / QUAY_COURSE_HEIGHT));
      for (let k = 0; k < 3; k++) {
        sums[course].light += luminance(color(quay, t * 3 + k));
        sums[course].count++;
        sums[course].xs.add(Math.round(tri[k][0] * 1e4));
      }
    });
    const means = sums.map((s) => s.light / s.count);
    for (let i = 0; i + 1 < QUAY_COURSE_COUNT; i++) {
      expect(sums[i].count).toBeGreaterThan(0);
      expect(Math.abs(means[i] - means[i + 1]) / Math.max(means[i], means[i + 1])).toBeGreaterThan(0.03);
      // More than one block per course, and the joints of neighbouring courses do not line up.
      expect(sums[i].xs.size).toBeGreaterThan(2);
      expect([...sums[i].xs].sort()).not.toEqual([...sums[i + 1].xs].sort());
    }
  });

  it("has no two overlapping coplanar faces", () => {
    const tris = triangles(quay);
    const normals = tris.map(faceNormal);
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        if (Math.abs(Math.abs(dot(normals[i], normals[j])) - 1) > 1e-6) continue;
        if (Math.abs(dot(sub(tris[j][0], tris[i][0]), normals[i])) > 1e-6) continue;
        expect(coplanarOverlap(tris[i], tris[j], normals[i]), `faces ${i} and ${j} overlap in one plane`).toBe(false);
      }
    }
  });

  it("has no face passing through another", () => {
    const tris = triangles(quay);
    for (let i = 0; i < tris.length; i++) {
      for (let j = 0; j < tris.length; j++) {
        if (i === j) continue;
        for (let k = 0; k < 3; k++) {
          expect(segmentCrossesTriangle(tris[i][k], tris[i][(k + 1) % 3], tris[j]), `edge of face ${i} crosses face ${j}`).toBe(false);
        }
      }
    }
  });

  it("bakes occlusion: the wall is dark at the waterline and under the coping, the deck is bright", () => {
    let waterline = 0;
    let waterlineCount = 0;
    let underCoping = 0;
    let underCopingCount = 0;
    let midWall = 0;
    let midWallCount = 0;
    let deck = 0;
    let deckCount = 0;
    for (let i = 0; i < quay.vertexCount; i++) {
      const c = color(quay, i);
      const [, y] = vertex(quay, i);
      const n = normal(quay, i);
      for (const v of c) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      const part = partOf(c);
      if (part === "stone" && Math.abs(y - SEA_LEVEL) < 1e-6 && Math.abs(n[1]) < 0.5) {
        waterline += luminance(c);
        waterlineCount++;
      }
      if (part === "stone" && Math.abs(y - QUAY_STEP_TOP) < 1e-6 && Math.abs(n[1]) < 0.5) {
        underCoping += luminance(c);
        underCopingCount++;
      }
      if (part === "stone" && y > SEA_LEVEL + 1e-6 && y < QUAY_STEP_TOP - 1e-6 && Math.abs(n[1]) < 0.5) {
        midWall += luminance(c);
        midWallCount++;
      }
      if (part === "coping" && Math.abs(y - QUAY_TOP) < 1e-6 && n[1] > 0.99) {
        deck += luminance(c);
        deckCount++;
      }
    }
    expect(waterlineCount).toBeGreaterThan(0);
    expect(underCopingCount).toBeGreaterThan(0);
    expect(midWallCount).toBeGreaterThan(0);
    expect(deckCount).toBeGreaterThan(0);
    expect(waterline / waterlineCount).toBeLessThan((midWall / midWallCount) * 0.9);
    expect(underCoping / underCopingCount).toBeLessThan((midWall / midWallCount) * 0.9);
    expect(deck / deckCount).toBeGreaterThan(luminance(colors.coping) * 0.9);
  });

  it("jitters the stone colours so no part is one flat tint", () => {
    const deck = new Set<number>();
    const wall = new Set<number>();
    for (let i = 0; i < quay.vertexCount; i++) {
      const c = color(quay, i);
      const [, y] = vertex(quay, i);
      const n = normal(quay, i);
      if (partOf(c) === "coping" && n[1] > 0.99 && Math.abs(y - QUAY_TOP) < 1e-6) deck.add(Math.round(luminance(c) * 1e4));
      if (partOf(c) === "stone" && y > SEA_LEVEL + 1e-6 && y < QUAY_STEP_TOP - 1e-6) wall.add(Math.round(luminance(c) * 1e4));
    }
    expect(deck.size).toBeGreaterThan(2);
    expect(wall.size).toBeGreaterThan(2);
  });

  it("is deterministic", () => {
    expect(buildQuayGeometry(colors).positions).toEqual(quay.positions);
    expect(buildQuayGeometry(colors).colors).toEqual(quay.colors);
  });
});
