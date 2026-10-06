import { describe, it, expect } from "vitest";
import type { FacetGeometryData } from "./facetBuilder";
import { PIER_DECK_TOP, PIER_POST_BOTTOM, PIER_WIDTH } from "./pierGeometry";
import {
  buildQuayGeometry,
  QUAY_BACK,
  QUAY_BARREL,
  QUAY_BASE,
  QUAY_BOLLARD,
  QUAY_COPING_PROUD,
  QUAY_COPING_THICKNESS,
  QUAY_COURSE_COUNT,
  QUAY_COURSE_HEIGHT,
  QUAY_COURSE_LEDGES,
  QUAY_CRATES,
  QUAY_DECK,
  QUAY_GROOVE_FLOOR,
  QUAY_SEA_FACE,
  QUAY_SLAB_GRID,
  QUAY_STAIR,
  QUAY_STEP_TOP,
  QUAY_STEP_Z,
  QUAY_TOP,
  QUAY_TRIANGLE_BUDGET,
  QUAY_TRIANGLES,
  QUAY_WET_HEIGHT,
  QUAY_WIDTH,
  type QuayColors,
} from "./quayGeometry";
import { SEA_LEVEL } from "./terrainHeightField";

const colors: QuayColors = { stone: [0.42, 0.38, 0.32], coping: [0.66, 0.6, 0.52], timber: [0.12, 0.08, 0.05] };
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
function partOf(c: Vec3): "stone" | "coping" | "timber" {
  // The wet, occluded stone at the waterline comes down to about 0.15; the timber never rises past 0.1.
  if (luminance(c) < 0.12) return "timber";
  // The coping starts well above the stone; occlusion and the wet band only ever darken the stone, and the tone spreads are small.
  return luminance(c) > (luminance(colors.stone) + luminance(colors.coping)) / 2 ? "coping" : "stone";
}

const EPS = 1e-6;
/** The sea wall's foot: nothing of the wall itself stands seaward of this; only the stair does. */
const WALL_FOOT = QUAY_SEA_FACE + QUAY_COPING_PROUD;

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

/** Axis-aligned bounds of a triangle, for a cheap first pass over pairs. */
function bounds(tri: Vec3[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of tri) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], p[k]);
    max[k] = Math.max(max[k], p[k]);
  }
  return { min, max };
}
const boundsTouch = (a: { min: Vec3; max: Vec3 }, b: { min: Vec3; max: Vec3 }) =>
  [0, 1, 2].every((k) => a.min[k] <= b.max[k] + EPS && b.min[k] <= a.max[k] + EPS);

/** Plan extents of the vertices whose colour passes `part` and whose height passes `where`. */
function planExtent(part: (c: Vec3) => boolean, where: (y: number) => boolean) {
  const e = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, count: 0 };
  for (let i = 0; i < quay.vertexCount; i++) {
    const [x, y, z] = vertex(quay, i);
    if (!part(color(quay, i)) || !where(y)) continue;
    e.minX = Math.min(e.minX, x);
    e.maxX = Math.max(e.maxX, x);
    e.minZ = Math.min(e.minZ, z);
    e.maxZ = Math.max(e.maxZ, z);
    e.count++;
  }
  return e;
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
    expect(QUAY_TRIANGLE_BUDGET).toBeLessThanOrEqual(700);
  });

  it("stores unit normals and a colour per vertex, with no degenerate face; flat except on the barrel", () => {
    expect(quay.colors).toHaveLength(quay.vertexCount * 3);
    triangles(quay).forEach((tri, t) => {
      const n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
      expect(Math.hypot(...n)).toBeGreaterThan(1e-9);
      for (let k = 0; k < 3; k++) {
        const stored = normal(quay, t * 3 + k);
        expect(Math.hypot(...stored)).toBeCloseTo(1, 5);
        const agreement = dot(stored, faceNormal(tri));
        // The barrel's lathe shares normals round its rings; everything else is flat-shaded.
        if (partOf(color(quay, t * 3)) === "timber") expect(agreement).toBeGreaterThan(0.6);
        else expect(agreement).toBeCloseTo(1, 4);
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
    // Only the stair stands seaward of the wall's foot.
    expect(maxZ).toBeCloseTo(QUAY_STAIR.back + QUAY_STAIR.depth, 6);
  });

  it("has a flat deck at QUAY_TOP, just above the pier deck, with grooves between its flagstones and only timber standing on it", () => {
    expect(QUAY_TOP).toBeGreaterThan(PIER_DECK_TOP);
    expect(QUAY_TOP - PIER_DECK_TOP).toBeLessThanOrEqual(0.02);
    expect(QUAY_STEP_TOP).toBeCloseTo(QUAY_TOP - QUAY_COPING_THICKNESS, 6);
    expect(QUAY_GROOVE_FLOOR).toBeLessThan(QUAY_TOP);
    expect(QUAY_GROOVE_FLOOR).toBeGreaterThan(QUAY_STEP_TOP);
    let topFaces = 0;
    let grooveFaces = 0;
    let stepFaces = 0;
    triangles(quay).forEach((tri, t) => {
      const n = normal(quay, t * 3);
      const part = partOf(color(quay, t * 3));
      const ys = tri.map((p) => p[1]);
      if (n[1] > 0.99 && part === "coping") {
        // Every upward coping face is a flagstone's top or the groove floor between them.
        if (Math.abs(ys[0] - QUAY_TOP) < 1e-6) topFaces++;
        else if (Math.abs(ys[0] - QUAY_GROOVE_FLOOR) < 1e-6) grooveFaces++;
        else expect.fail(`an upward coping face at ${ys[0]}`);
        for (const y of ys) expect(y).toBeCloseTo(ys[0], 6);
      }
      if (n[1] > 0.99 && part === "stone" && Math.abs(ys[0] - QUAY_STEP_TOP) < 1e-6) stepFaces++;
      for (const [x, y, z] of tri) {
        if (y > QUAY_TOP + 1e-6) {
          expect(part).toBe("timber");
          expect(x).toBeGreaterThanOrEqual(QUAY_DECK.minX);
          expect(x).toBeLessThanOrEqual(QUAY_DECK.maxX);
          expect(z).toBeGreaterThanOrEqual(QUAY_DECK.minZ);
          expect(z).toBeLessThanOrEqual(QUAY_DECK.maxZ);
        }
      }
    });
    expect(topFaces).toBe(2 * QUAY_SLAB_GRID.across * QUAY_SLAB_GRID.along);
    expect(grooveFaces).toBe(2);
    expect(stepFaces).toBe(2);
  });

  it("lays the deck as a grid of flagstones with visibly different tones", () => {
    expect(QUAY_SLAB_GRID.across).toBeGreaterThanOrEqual(3);
    expect(QUAY_SLAB_GRID.along).toBeGreaterThanOrEqual(2);
    // One tone per flagstone top (the per-vertex jitter is hashed by position, so a flat quad's corners differ a little;
    // group by the quad's centre instead).
    const tones = new Map<string, number[]>();
    triangles(quay).forEach((tri, t) => {
      if (normal(quay, t * 3)[1] < 0.99 || partOf(color(quay, t * 3)) !== "coping" || Math.abs(tri[0][1] - QUAY_TOP) > 1e-6) return;
      const b = bounds(tri);
      // A flagstone top is two triangles with the same bounding box.
      const key = `${b.min[0].toFixed(4)},${b.max[0].toFixed(4)},${b.min[2].toFixed(4)},${b.max[2].toFixed(4)}`;
      const list = tones.get(key) ?? [];
      for (let k = 0; k < 3; k++) list.push(luminance(color(quay, t * 3 + k)));
      tones.set(key, list);
    });
    expect(tones.size).toBe(QUAY_SLAB_GRID.across * QUAY_SLAB_GRID.along);
    const means = [...tones.values()].map((l) => l.reduce((a, b) => a + b, 0) / l.length);
    expect(Math.max(...means) / Math.min(...means)).toBeGreaterThan(1.1);
    // Irregular widths: not every flagstone is the same size.
    const widths = new Set([...tones.keys()].map((k) => (Number(k.split(",")[1]) - Number(k.split(",")[0])).toFixed(3)));
    expect(widths.size).toBeGreaterThan(1);
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

  it("bevels the coping's outer edge and each flagstone: lighter facets at 45 degrees", () => {
    let outer = 0;
    let slabs = 0;
    for (let t = 0; t < quay.vertexCount / 3; t++) {
      const n = normal(quay, t * 3);
      if (partOf(color(quay, t * 3)) !== "coping" || Math.abs(n[1] - Math.SQRT1_2) > 1e-4) continue;
      const y = vertex(quay, t * 3)[1];
      if (y > QUAY_GROOVE_FLOOR + 1e-6) slabs++;
      else outer++;
    }
    expect(outer).toBeGreaterThanOrEqual(8);
    expect(slabs).toBeGreaterThanOrEqual(8 * QUAY_SLAB_GRID.across * QUAY_SLAB_GRID.along);
  });

  it("lays the wall above the waterline in stepped courses: a ledge at each course line, out to the coping's edge at the foot", () => {
    expect(QUAY_COURSE_COUNT).toBeGreaterThanOrEqual(3);
    expect(QUAY_COURSE_LEDGES).toHaveLength(QUAY_COURSE_COUNT);
    expect(QUAY_COURSE_LEDGES[0]).toBeCloseTo(SEA_LEVEL, 6);
    expect(QUAY_COURSE_LEDGES[QUAY_COURSE_COUNT - 1]).toBeLessThan(QUAY_STEP_TOP - 0.01);
    const tris = triangles(quay);
    for (const y of QUAY_COURSE_LEDGES) {
      let frontLedges = 0;
      tris.forEach((tri, t) => {
        if (partOf(color(quay, t * 3)) !== "stone" || normal(quay, t * 3)[1] < 0.99) return;
        if (tri.every((p) => Math.abs(p[1] - y) < 1e-6 && p[2] > QUAY_SEA_FACE - 1e-6 && p[2] <= WALL_FOOT + 1e-6)) frontLedges++;
      });
      expect(frontLedges, `front ledge at ${y}`).toBe(2);
    }
    // Each course's face is vertical; the courses step out going down, the lowest flush with the coping's edge.
    let footZ = -Infinity;
    let topCourseZ = -Infinity;
    for (let i = 0; i < quay.vertexCount; i++) {
      const [, y, z] = vertex(quay, i);
      const n = normal(quay, i);
      if (partOf(color(quay, i)) !== "stone" || n[2] < 0.99 || z > WALL_FOOT + 1e-6) continue;
      expect(Math.abs(n[1])).toBeLessThan(1e-6);
      if (Math.abs(y - SEA_LEVEL) < 1e-6) footZ = Math.max(footZ, z);
      if (Math.abs(y - QUAY_STEP_TOP) < 1e-6) topCourseZ = Math.max(topCourseZ, z);
    }
    expect(footZ).toBeCloseTo(WALL_FOOT, 6);
    expect(topCourseZ).toBeCloseTo(QUAY_SEA_FACE, 6);
  });

  it("sets proud blocks on the sea face, each a shadow groove apart, alternating the courses in tone and staggering the joints", () => {
    const tris = triangles(quay);
    const courses = Array.from({ length: QUAY_COURSE_COUNT }, () => ({ light: 0, count: 0, xs: new Set<number>(), proud: 0 }));
    tris.forEach((tri, t) => {
      if (partOf(color(quay, t * 3)) !== "stone" || normal(quay, t * 3)[2] < 0.99) return;
      const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      if (cy < SEA_LEVEL || tri[0][2] > WALL_FOOT + 1e-6) return;
      const course = Math.min(QUAY_COURSE_COUNT - 1, Math.floor((cy - SEA_LEVEL) / QUAY_COURSE_HEIGHT));
      const z = tri[0][2];
      // The block faces stand proud of the course's own wall plane.
      const wallZ = QUAY_SEA_FACE + (QUAY_COURSE_COUNT - 1 - course) * (QUAY_COPING_PROUD / QUAY_COURSE_COUNT);
      if (z > wallZ + 1e-6) {
        courses[course].proud = Math.max(courses[course].proud, z - wallZ);
        for (let k = 0; k < 3; k++) {
          courses[course].light += luminance(color(quay, t * 3 + k));
          courses[course].count++;
          courses[course].xs.add(Math.round(tri[k][0] * 1e4));
        }
      }
    });
    const means = courses.map((s) => s.light / s.count);
    for (let i = 0; i < QUAY_COURSE_COUNT; i++) {
      expect(courses[i].count).toBeGreaterThan(0);
      expect(courses[i].proud).toBeGreaterThanOrEqual(0.004 - 1e-6);
      expect(courses[i].proud).toBeLessThan(QUAY_COPING_PROUD / QUAY_COURSE_COUNT);
      // Several blocks per course, and the joints of neighbouring courses do not line up.
      expect(courses[i].xs.size).toBeGreaterThan(4);
      if (i + 1 < QUAY_COURSE_COUNT) {
        expect(Math.abs(means[i] - means[i + 1]) / Math.max(means[i], means[i + 1])).toBeGreaterThan(0.03);
        expect([...courses[i].xs].sort()).not.toEqual([...courses[i + 1].xs].sort());
      }
    }
  });

  it("darkens and greens the wall towards the waterline: a wet band over the lowest course", () => {
    expect(QUAY_WET_HEIGHT).toBeGreaterThan(0);
    expect(QUAY_WET_HEIGHT).toBeLessThanOrEqual(QUAY_COURSE_HEIGHT + 1e-9);
    const at = (y: number) => {
      const sum = [0, 0, 0];
      let count = 0;
      for (let i = 0; i < quay.vertexCount; i++) {
        const [, py, z] = vertex(quay, i);
        const n = normal(quay, i);
        if (partOf(color(quay, i)) !== "stone" || Math.abs(py - y) > 1e-6 || n[2] < 0.99 || z > WALL_FOOT + 1e-6) continue;
        const c = color(quay, i);
        for (let k = 0; k < 3; k++) sum[k] += c[k];
        count++;
      }
      expect(count).toBeGreaterThan(0);
      return sum.map((v) => v / count);
    };
    const wet = at(SEA_LEVEL);
    const dry = at(QUAY_COURSE_LEDGES[1] + QUAY_COURSE_HEIGHT);
    expect(luminance(wet as Vec3)).toBeLessThan(luminance(dry as Vec3) * 0.75);
    // Greener: the green channel loses less than the red.
    expect(wet[1] / dry[1]).toBeGreaterThan(wet[0] / dry[0]);
  });

  it("hangs a stair at the +x end of the sea wall: treads stepping down from under the coping to the water", () => {
    expect(QUAY_STAIR.steps).toBeGreaterThanOrEqual(3);
    expect(QUAY_STAIR.steps).toBeLessThanOrEqual(4);
    expect(QUAY_STAIR.back).toBeGreaterThan(WALL_FOOT);
    expect(QUAY_STAIR.back - WALL_FOOT).toBeLessThan(0.003);
    expect(QUAY_STAIR.x0).toBeGreaterThan(PIER_WIDTH / 2);
    expect(QUAY_STAIR.x0 + QUAY_STAIR.steps * QUAY_STAIR.tread).toBeLessThanOrEqual(QUAY_WIDTH / 2 + QUAY_COPING_PROUD + 1e-9);
    const tris = triangles(quay);
    for (let k = 0; k < QUAY_STAIR.steps; k++) {
      const y = QUAY_STAIR.topTread - k * QUAY_STAIR.rise;
      expect(y).toBeLessThan(QUAY_STEP_TOP);
      expect(y).toBeGreaterThan(SEA_LEVEL);
      let treads = 0;
      tris.forEach((tri, t) => {
        if (normal(quay, t * 3)[1] < 0.99 || partOf(color(quay, t * 3)) !== "stone") return;
        if (tri.every((p) => Math.abs(p[1] - y) < 1e-6 && p[2] >= QUAY_STAIR.back - 1e-6)) treads++;
      });
      expect(treads, `tread ${k}`).toBe(2);
    }
    // The flight's riser line runs down towards the end: the lowest slab is the widest.
    const stair = planExtent((c) => partOf(c) === "stone", (y) => y > SEA_LEVEL);
    expect(stair.maxZ).toBeCloseTo(QUAY_STAIR.back + QUAY_STAIR.depth, 6);
  });

  it("dresses the deck with crates and a barrel inside the deck outline, clear of the pier root and the bollards", () => {
    expect(QUAY_CRATES.length).toBeGreaterThanOrEqual(2);
    expect(QUAY_CRATES.length).toBeLessThanOrEqual(3);
    expect(QUAY_CRATES.some((c) => Math.abs(c.yaw) > 0.2)).toBe(true);
    for (const crate of QUAY_CRATES) {
      const reach = crate.size * Math.SQRT1_2;
      expect(crate.x - reach).toBeGreaterThanOrEqual(QUAY_DECK.minX);
      expect(crate.x + reach).toBeLessThanOrEqual(QUAY_DECK.maxX);
      expect(crate.z - reach).toBeGreaterThanOrEqual(QUAY_DECK.minZ);
      expect(crate.z + reach).toBeLessThanOrEqual(QUAY_DECK.maxZ);
      // Behind the pier's root and off the bollards.
      expect(crate.z + reach).toBeLessThan(0);
      for (const sign of [-1, 1]) expect(Math.hypot(crate.x - sign * (QUAY_WIDTH / 2 - QUAY_BOLLARD.inset), crate.z - QUAY_BOLLARD.z)).toBeGreaterThan(reach + 0.02);
    }
    expect(QUAY_BARREL.x - QUAY_BARREL.radius).toBeGreaterThanOrEqual(QUAY_DECK.minX);
    expect(QUAY_BARREL.x + QUAY_BARREL.radius).toBeLessThanOrEqual(QUAY_DECK.maxX);
    expect(QUAY_BARREL.z - QUAY_BARREL.radius).toBeGreaterThanOrEqual(QUAY_DECK.minZ);
    expect(QUAY_BARREL.z + QUAY_BARREL.radius).toBeLessThan(0);
    // The barrel is there: a timber ring at its top, and two darker hoops on its side.
    const timberAbove = planExtent((c) => partOf(c) === "timber", (y) => y > QUAY_TOP + 1e-6);
    expect(timberAbove.count).toBeGreaterThan(0);
    const sideTones = new Set<number>();
    for (let i = 0; i < quay.vertexCount; i++) {
      const [x, y, z] = vertex(quay, i);
      if (partOf(color(quay, i)) !== "timber" || Math.hypot(x - QUAY_BARREL.x, z - QUAY_BARREL.z) > QUAY_BARREL.radius + 1e-6 || y <= QUAY_TOP) continue;
      if (Math.abs(normal(quay, i)[1]) < 0.5) sideTones.add(Math.round(luminance(color(quay, i)) * 1e3));
    }
    expect(sideTones.size).toBeGreaterThanOrEqual(2);
  });

  it("has no two overlapping coplanar faces", () => {
    const tris = triangles(quay);
    const normals = tris.map(faceNormal);
    const boxes = tris.map(bounds);
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        if (!boundsTouch(boxes[i], boxes[j])) continue;
        if (Math.abs(Math.abs(dot(normals[i], normals[j])) - 1) > 1e-6) continue;
        if (Math.abs(dot(sub(tris[j][0], tris[i][0]), normals[i])) > 1e-6) continue;
        expect(coplanarOverlap(tris[i], tris[j], normals[i]), `faces ${i} and ${j} overlap in one plane`).toBe(false);
      }
    }
  });

  it("has no face passing through another", () => {
    const tris = triangles(quay);
    const boxes = tris.map(bounds);
    for (let i = 0; i < tris.length; i++) {
      for (let j = 0; j < tris.length; j++) {
        if (i === j || !boundsTouch(boxes[i], boxes[j])) continue;
        for (let k = 0; k < 3; k++) {
          expect(segmentCrossesTriangle(tris[i][k], tris[i][(k + 1) % 3], tris[j]), `edge of face ${i} crosses face ${j}`).toBe(false);
        }
      }
    }
  });

  it("bakes occlusion: the wall is dark under the coping, the deck is bright", () => {
    let underCoping = 0;
    let underCopingCount = 0;
    let midWall = 0;
    let midWallCount = 0;
    let deck = 0;
    let deckCount = 0;
    for (let i = 0; i < quay.vertexCount; i++) {
      const c = color(quay, i);
      const [, y, z] = vertex(quay, i);
      const n = normal(quay, i);
      for (const v of c) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      const part = partOf(c);
      if (part === "stone" && z <= WALL_FOOT + 1e-6 && Math.abs(y - QUAY_STEP_TOP) < 1e-6 && Math.abs(n[1]) < 0.5) {
        underCoping += luminance(c);
        underCopingCount++;
      }
      // The middle course's wall, above the wet band and below the coping's shade.
      if (part === "stone" && z <= WALL_FOOT + 1e-6 && y > QUAY_COURSE_LEDGES[1] + 1e-6 && y < QUAY_COURSE_LEDGES[2] - 1e-6 && Math.abs(n[1]) < 0.5) {
        midWall += luminance(c);
        midWallCount++;
      }
      if (part === "coping" && Math.abs(y - QUAY_TOP) < 1e-6 && n[1] > 0.99) {
        deck += luminance(c);
        deckCount++;
      }
    }
    expect(underCopingCount).toBeGreaterThan(0);
    expect(midWallCount).toBeGreaterThan(0);
    expect(deckCount).toBeGreaterThan(0);
    expect(underCoping / underCopingCount).toBeLessThan((midWall / midWallCount) * 0.9);
    expect(deck / deckCount).toBeGreaterThan(luminance(colors.coping) * 0.85);
  });

  it("is deterministic", () => {
    expect(buildQuayGeometry(colors).positions).toEqual(quay.positions);
    expect(buildQuayGeometry(colors).colors).toEqual(quay.colors);
  });
});
