import { describe, it, expect } from "vitest";
import type { FacetGeometryData } from "./facetBuilder";
import { PIER_DECK_TOP, PIER_POST_BOTTOM, PIER_WIDTH } from "./pierGeometry";
import {
  buildQuayGeometry,
  buildQuayParts,
  QUAY_BACK,
  QUAY_BARREL,
  QUAY_BASE,
  QUAY_BLOCK_PROUD,
  QUAY_BOLLARD,
  QUAY_BOLLARDS,
  QUAY_COPING_PROUD,
  QUAY_COPING_THICKNESS,
  QUAY_COURSE_COUNT,
  QUAY_COURSE_HEIGHT,
  QUAY_COURSE_LEDGES,
  QUAY_CRATE,
  QUAY_DECK,
  QUAY_JOINT,
  QUAY_PAVING,
  QUAY_PAVING_FLOOR,
  QUAY_PAVING_ROWS,
  QUAY_PAVING_SINK,
  QUAY_PAVING_TILT,
  QUAY_ROPE,
  QUAY_SEA_FACE,
  QUAY_STAIR,
  QUAY_STEP_TOP,
  QUAY_STEP_Z,
  QUAY_TOP,
  QUAY_TRIANGLE_BUDGET,
  QUAY_TRIANGLES,
  QUAY_WALL_BLOCKS,
  QUAY_WET_HEIGHT,
  QUAY_WIDTH,
  type QuayColors,
  type QuayPart,
} from "./quayGeometry";
import { SEA_LEVEL } from "./terrainHeightField";

const colors: QuayColors = {
  stone: [0.4, 0.34, 0.26],
  mortar: [0.11, 0.09, 0.07],
  timber: [0.12, 0.08, 0.05],
  iron: [0.045, 0.04, 0.038],
  rope: [0.42, 0.34, 0.22],
  sand: [0.77, 0.63, 0.34],
};
const build = buildQuayParts(colors);
const quay = build.data;

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

/** Which part vertex `i` belongs to, from the build's own ranges. */
function partOf(i: number): QuayPart {
  for (const [name, [from, to]] of Object.entries(build.parts) as [QuayPart, readonly [number, number]][]) if (i >= from && i < to) return name;
  throw new Error(`vertex ${i} is in no part`);
}
const partTriangles = (name: QuayPart) => {
  const [from, to] = build.parts[name];
  return Array.from({ length: (to - from) / 3 }, (_, k) => from / 3 + k);
};
const vertices = (name: QuayPart) => {
  const [from, to] = build.parts[name];
  return Array.from({ length: to - from }, (_, k) => from + k);
};

const EPS = 1e-6;
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

const spread = (values: number[]) => Math.max(...values) / Math.min(...values);
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

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
    expect(segmentCrossesTriangle([0.5, -1, 0], [0.5, 1, 0], floor)).toBe(false);
    expect(segmentCrossesTriangle([0.1, 0, 0.1], [0.3, 0, 0.3], floor)).toBe(false);
  });
});

describe("buildQuayGeometry", () => {
  it("records its triangle count under the budget, with every vertex in exactly one part", () => {
    expect(quay.vertexCount % 3).toBe(0);
    expect(quay.vertexCount / 3).toBe(QUAY_TRIANGLES);
    expect(QUAY_TRIANGLES).toBeLessThanOrEqual(QUAY_TRIANGLE_BUDGET);
    expect(QUAY_TRIANGLE_BUDGET).toBeLessThanOrEqual(1000);
    const ranges = Object.values(build.parts).sort((a, b) => a[0] - b[0]);
    expect(ranges[0][0]).toBe(0);
    for (let k = 1; k < ranges.length; k++) expect(ranges[k][0]).toBe(ranges[k - 1][1]);
    expect(ranges[ranges.length - 1][1]).toBe(quay.vertexCount);
    for (const [from, to] of ranges) expect((to - from) % 3).toBe(0);
  });

  it("stores unit normals and a colour per vertex, with no degenerate face; flat except on the rope's lathe", () => {
    expect(quay.colors).toHaveLength(quay.vertexCount * 3);
    triangles(quay).forEach((tri, t) => {
      const n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
      expect(Math.hypot(...n)).toBeGreaterThan(1e-9);
      for (let k = 0; k < 3; k++) {
        const stored = normal(quay, t * 3 + k);
        expect(Math.hypot(...stored)).toBeCloseTo(1, 5);
        const agreement = dot(stored, faceNormal(tri));
        if (partOf(t * 3) === "rope") expect(agreement).toBeGreaterThan(0.5);
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
    expect(maxZ).toBeCloseTo(QUAY_STAIR.back + QUAY_STAIR.depth, 6);
  });

  it("keeps the deck at QUAY_TOP within the paving's unevenness, just above the pier deck, with only props standing higher", () => {
    expect(QUAY_TOP).toBeGreaterThan(PIER_DECK_TOP);
    expect(QUAY_TOP - PIER_DECK_TOP).toBeLessThanOrEqual(0.02);
    expect(QUAY_STEP_TOP).toBeCloseTo(QUAY_TOP - QUAY_COPING_THICKNESS, 6);
    expect(QUAY_PAVING_FLOOR).toBeGreaterThan(QUAY_STEP_TOP);
    for (const i of vertices("paving")) {
      const y = vertex(quay, i)[1];
      expect(y).toBeGreaterThanOrEqual(QUAY_PAVING_FLOOR - EPS);
      expect(y).toBeLessThanOrEqual(QUAY_TOP + QUAY_PAVING_TILT + EPS);
      expect(y).toBeGreaterThanOrEqual(QUAY_PAVING_FLOOR - EPS);
      if (y > QUAY_PAVING_FLOOR + EPS) expect(y).toBeGreaterThanOrEqual(QUAY_TOP - QUAY_PAVING_TILT - QUAY_PAVING_SINK - EPS);
    }
    for (let i = 0; i < quay.vertexCount; i++) {
      const [x, y, z] = vertex(quay, i);
      if (y <= QUAY_TOP + QUAY_PAVING_TILT + EPS) continue;
      expect(["bollards", "rope", "crate", "barrel"]).toContain(partOf(i));
      expect(x).toBeGreaterThanOrEqual(QUAY_DECK.minX);
      expect(x).toBeLessThanOrEqual(QUAY_DECK.maxX);
      expect(z).toBeGreaterThanOrEqual(QUAY_DECK.minZ);
      expect(z).toBeLessThanOrEqual(QUAY_DECK.maxZ);
    }
  });

  it("paves the deck with ten to fourteen unequal stones, joints of varying width, every corner at its own height, a few sunk, no bevels", () => {
    expect(QUAY_PAVING.length).toBeGreaterThanOrEqual(10);
    expect(QUAY_PAVING.length).toBeLessThanOrEqual(14);
    expect(QUAY_PAVING).toHaveLength(QUAY_PAVING_ROWS.reduce((a, b) => a + b, 0));
    const widths = QUAY_PAVING.map((s) => s.x1 - s.x0);
    expect(spread(widths)).toBeGreaterThan(1.2);
    const joints = new Set<number>();
    for (const row of QUAY_PAVING_ROWS.keys()) {
      const stones = QUAY_PAVING.filter((s) => s.row === row).sort((a, b) => a.x0 - b.x0);
      expect(stones[0].x0).toBeCloseTo(QUAY_DECK.minX, 9);
      expect(stones[stones.length - 1].x1).toBeCloseTo(QUAY_DECK.maxX, 9);
      for (let k = 1; k < stones.length; k++) {
        const joint = stones[k].x0 - stones[k - 1].x1;
        expect(joint).toBeGreaterThanOrEqual(QUAY_JOINT[0] - EPS);
        expect(joint).toBeLessThanOrEqual(QUAY_JOINT[1] + EPS);
        joints.add(Number(joint.toFixed(4)));
      }
    }
    expect(joints.size).toBeGreaterThan(3);
    // Corners: the tilted stones have four different heights; some are sunk; the ones under props are flat.
    const tilted = QUAY_PAVING.filter((s) => !s.flat);
    expect(tilted.length).toBeGreaterThanOrEqual(6);
    for (const s of tilted) expect(new Set(s.corners).size).toBe(4);
    expect(tilted.some((s) => mean([...s.corners]) < QUAY_TOP - QUAY_PAVING_SINK + QUAY_PAVING_TILT)).toBe(true);
    for (const s of QUAY_PAVING.filter((s) => s.flat)) expect(s.corners).toEqual([QUAY_TOP, QUAY_TOP, QUAY_TOP, QUAY_TOP]);
    // No bevels: every paving face is a top facet or a vertical side.
    for (const t of partTriangles("paving")) {
      const n = normal(quay, t * 3);
      expect(n[1] > 0.9 || Math.abs(n[1]) < 0.3).toBe(true);
    }
    // Ten stones' worth of faces at least: four sides and a two-facet top each.
    expect(partTriangles("paving").length).toBe(QUAY_PAVING.length * 10);
  });

  it("drifts sand over the landward paving and keeps the seaward row stone", () => {
    const rowLuminance = (row: number) => {
      const values: number[] = [];
      for (const i of vertices("paving")) {
        const [x, y, z] = vertex(quay, i);
        const stone = QUAY_PAVING.find((s) => s.row === row && x >= s.x0 - EPS && x <= s.x1 + EPS && z >= s.z0 - EPS && z <= s.z1 + EPS);
        if (stone && y > QUAY_PAVING_FLOOR + EPS && z < stone.z0 + EPS) values.push(luminance(color(quay, i)));
      }
      return mean(values);
    };
    expect(rowLuminance(0)).toBeGreaterThan(rowLuminance(QUAY_PAVING_ROWS.length - 1) * 1.3);
  });

  it("steps down landward of QUAY_STEP_Z: the paving covers the front, the lower step the back", () => {
    expect(QUAY_STEP_Z).toBeGreaterThan(QUAY_BACK);
    expect(QUAY_STEP_Z).toBeLessThan(0);
    for (const i of vertices("paving")) expect(vertex(quay, i)[2]).toBeGreaterThanOrEqual(QUAY_STEP_Z - EPS);
    let stepFaces = 0;
    for (const t of partTriangles("wall")) {
      const tri = [vertex(quay, t * 3), vertex(quay, t * 3 + 1), vertex(quay, t * 3 + 2)];
      if (normal(quay, t * 3)[1] > 0.99 && tri.every((p) => Math.abs(p[1] - QUAY_STEP_TOP) < EPS)) {
        stepFaces++;
        for (const p of tri) expect(p[2]).toBeLessThanOrEqual(QUAY_STEP_Z + EPS);
      }
    }
    expect(stepFaces).toBe(2);
  });

  it("lays the wall above the waterline in two tall battered courses: a ledge at each course line, the foot flush with the base's edge", () => {
    expect(QUAY_COURSE_COUNT).toBe(2);
    expect(QUAY_COURSE_HEIGHT).toBeGreaterThan(0.025);
    expect(QUAY_COURSE_LEDGES).toEqual([SEA_LEVEL, SEA_LEVEL + QUAY_COURSE_HEIGHT]);
    for (const y of QUAY_COURSE_LEDGES) {
      let frontLedges = 0;
      for (const t of partTriangles("wall")) {
        const tri = [vertex(quay, t * 3), vertex(quay, t * 3 + 1), vertex(quay, t * 3 + 2)];
        if (normal(quay, t * 3)[1] < 0.99) continue;
        if (tri.every((p) => Math.abs(p[1] - y) < EPS && p[2] > QUAY_SEA_FACE - EPS)) frontLedges++;
      }
      expect(frontLedges, `front ledge at ${y}`).toBe(2);
    }
    let footZ = -Infinity;
    let topCourseZ = -Infinity;
    for (const i of vertices("wall")) {
      const [, y, z] = vertex(quay, i);
      if (normal(quay, i)[2] < 0.99 || z > WALL_FOOT + EPS) continue;
      if (Math.abs(y - SEA_LEVEL) < EPS) footZ = Math.max(footZ, z);
      if (Math.abs(y - QUAY_STEP_TOP) < EPS) topCourseZ = Math.max(topCourseZ, z);
    }
    expect(footZ).toBeCloseTo(QUAY_SEA_FACE + QUAY_COPING_PROUD / 2, 6);
    expect(topCourseZ).toBeCloseTo(QUAY_SEA_FACE, 6);
  });

  it("sets rough-cut blocks on the sea face and the seaward sides: unequal widths, wobbling beds, each proud by its own amount, chipped and missing ones, strong tone variation", () => {
    expect(QUAY_WALL_BLOCKS.length).toBeGreaterThan(20);
    for (const face of ["sea", "left", "right"] as const) {
      for (let course = 0; course < QUAY_COURSE_COUNT; course++) {
        const row = QUAY_WALL_BLOCKS.filter((k) => k.face === face && k.course === course).sort((a, b) => a.u0 - b.u0);
        expect(row.length).toBeGreaterThanOrEqual(3);
        expect(spread(row.map((k) => k.u1 - k.u0))).toBeGreaterThan(1.25);
        expect(new Set(row.map((k) => k.v0.toFixed(5))).size).toBeGreaterThan(1);
        expect(new Set(row.map((k) => k.proud.toFixed(5))).size).toBeGreaterThan(1);
        for (let k = 1; k < row.length; k++) {
          const joint = row[k].u0 - row[k - 1].u1;
          expect(joint).toBeGreaterThanOrEqual(QUAY_JOINT[0] - EPS);
          expect(joint).toBeLessThanOrEqual(QUAY_JOINT[1] + EPS);
        }
        for (const block of row) {
          expect(block.proud).toBeGreaterThanOrEqual(QUAY_BLOCK_PROUD[course][0] - EPS);
          expect(block.proud).toBeLessThanOrEqual(QUAY_BLOCK_PROUD[course][1] + EPS);
          // The ledges are listed from the waterline up; the courses run from the top down.
          expect(block.v0).toBeGreaterThan(QUAY_COURSE_LEDGES[QUAY_COURSE_COUNT - 1 - course]);
          expect(block.v1).toBeLessThan(course === 0 ? QUAY_STEP_TOP : QUAY_COURSE_LEDGES[QUAY_COURSE_COUNT - course]);
          expect(Math.abs(block.tone - 1)).toBeLessThanOrEqual(0.15 + EPS);
        }
      }
    }
    expect(QUAY_BLOCK_PROUD[0][1]).toBeCloseTo(0.01, 9);
    expect(QUAY_BLOCK_PROUD[0][0]).toBeCloseTo(0.002, 9);
    expect(spread(QUAY_WALL_BLOCKS.map((k) => k.tone))).toBeGreaterThan(1.2);
    expect(QUAY_WALL_BLOCKS.filter((k) => k.chip !== undefined).length).toBeGreaterThanOrEqual(2);
    expect(QUAY_WALL_BLOCKS.filter((k) => k.missing).length).toBeGreaterThanOrEqual(1);
    expect(QUAY_WALL_BLOCKS.filter((k) => k.missing).length).toBeLessThanOrEqual(2);
    expect(QUAY_WALL_BLOCKS.filter((k) => k.stained).length).toBeGreaterThanOrEqual(2);
    // Built: a chipped block is a pentagon (three facets) with five side quads, a plain one a quad with four, a missing one nothing.
    const built = QUAY_WALL_BLOCKS.filter((k) => !k.missing);
    const expected = built.reduce((a, k) => a + (k.chip === undefined ? 10 : 13), 0);
    expect(partTriangles("blocks").length).toBe(expected);
    // Every block face stands off its mortar plane, outward.
    for (const t of partTriangles("blocks")) {
      const [x, , z] = vertex(quay, t * 3);
      expect(z <= WALL_FOOT + EPS && Math.abs(x) <= QUAY_WIDTH / 2 + QUAY_COPING_PROUD + EPS).toBe(true);
    }
  });

  it("shows dark mortar behind the blocks: the wall's sea face is far darker than the blocks on it", () => {
    const seaPlane: number[] = [];
    for (const i of vertices("wall")) {
      const [, y, z] = vertex(quay, i);
      if (normal(quay, i)[2] > 0.99 && Math.abs(z - QUAY_SEA_FACE) < EPS && y > QUAY_COURSE_LEDGES[1] + QUAY_COURSE_HEIGHT * 0.5) seaPlane.push(luminance(color(quay, i)));
    }
    const blocks: number[] = [];
    for (const i of vertices("blocks")) {
      const [, y] = vertex(quay, i);
      if (normal(quay, i)[2] > 0.99 && y > QUAY_COURSE_LEDGES[1] + QUAY_COURSE_HEIGHT * 0.5) blocks.push(luminance(color(quay, i)));
    }
    expect(seaPlane.length).toBeGreaterThan(0);
    expect(blocks.length).toBeGreaterThan(0);
    expect(mean(seaPlane)).toBeLessThan(mean(blocks) * 0.5);
  });

  it("darkens and greens the wall towards the waterline: a wet band over most of the lower course", () => {
    expect(QUAY_WET_HEIGHT).toBeGreaterThan(QUAY_COURSE_HEIGHT * 0.6);
    expect(QUAY_WET_HEIGHT).toBeLessThanOrEqual(QUAY_COURSE_HEIGHT + 1e-9);
    const at = (lo: number, hi: number) => {
      const sum = [0, 0, 0];
      let count = 0;
      for (const i of vertices("blocks")) {
        const [, y] = vertex(quay, i);
        if (y < lo || y > hi || normal(quay, i)[2] < 0.99) continue;
        const c = color(quay, i);
        for (let k = 0; k < 3; k++) sum[k] += c[k];
        count++;
      }
      expect(count).toBeGreaterThan(0);
      return sum.map((v) => v / count);
    };
    const wet = at(SEA_LEVEL, SEA_LEVEL + 0.008);
    const dry = at(QUAY_COURSE_LEDGES[1] + 0.012, QUAY_STEP_TOP);
    expect(luminance(wet as Vec3)).toBeLessThan(luminance(dry as Vec3) * 0.75);
    expect(wet[1] / dry[1]).toBeGreaterThan(wet[0] / dry[0]);
  });

  it("hangs a worn stair at the +x end of the sea wall: uneven rises, a chipped top tread, clear of the proudest block", () => {
    expect(QUAY_STAIR.steps).toBe(3);
    expect(QUAY_STAIR.rises).toHaveLength(3);
    expect(spread(QUAY_STAIR.rises)).toBeGreaterThan(1.1);
    expect(QUAY_STAIR.rises.reduce((a, b) => a + b, 0)).toBeCloseTo(QUAY_STAIR.topTread - SEA_LEVEL, 9);
    expect(QUAY_STAIR.back).toBeGreaterThan(QUAY_SEA_FACE + QUAY_COPING_PROUD / 2 + QUAY_BLOCK_PROUD[1][1]);
    expect(QUAY_STAIR.back - WALL_FOOT).toBeLessThan(0.002);
    expect(QUAY_STAIR.x0).toBeGreaterThan(PIER_WIDTH / 2);
    expect(QUAY_STAIR.x0 + QUAY_STAIR.treads.reduce((a, b) => a + b, 0)).toBeCloseTo(QUAY_WIDTH / 2 + QUAY_COPING_PROUD, 9);
    let y = QUAY_STAIR.topTread;
    for (let k = 0; k < QUAY_STAIR.steps; k++) {
      expect(y).toBeLessThan(QUAY_STEP_TOP);
      expect(y).toBeGreaterThan(SEA_LEVEL);
      let treads = 0;
      for (const t of partTriangles("stair")) {
        const tri = [vertex(quay, t * 3), vertex(quay, t * 3 + 1), vertex(quay, t * 3 + 2)];
        if (normal(quay, t * 3)[1] > 0.99 && tri.every((p) => Math.abs(p[1] - y) < EPS)) treads++;
      }
      // The chipped top tread is a pentagon (three facets); the others are quads.
      expect(treads, `tread ${k}`).toBe(k === 0 ? 3 : 2);
      y -= QUAY_STAIR.rises[k];
    }
  });

  it("stands its props on flat stones inside the deck outline: leaning tapered posts worn at the foot, a rope coil, an aged crate and a hooped barrel", () => {
    const stoneUnder = (x: number, z: number) => QUAY_PAVING.find((s) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1);
    for (const spot of [...QUAY_BOLLARDS, QUAY_CRATE, QUAY_BARREL, QUAY_ROPE]) {
      const stone = stoneUnder(spot.x, spot.z);
      expect(stone?.flat).toBe(true);
    }
    expect(QUAY_BOLLARDS).toHaveLength(2);
    expect(QUAY_BOLLARD.lean).toBeGreaterThanOrEqual((3 * Math.PI) / 180);
    expect(QUAY_BOLLARD.lean).toBeLessThanOrEqual((5 * Math.PI) / 180);
    expect(QUAY_BOLLARD.topRadius).toBeLessThan(QUAY_BOLLARD.radius);
    // Each post: 8 sides and an 8-gon cap; its foot ring is on the deck, its top ring pushed over by the lean, and its foot is darker than its top.
    expect(partTriangles("bollards").length).toBe(2 * (16 + 6));
    const posts = vertices("bollards");
    const feet = posts.filter((i) => Math.abs(vertex(quay, i)[1] - QUAY_TOP) < EPS);
    const tops = posts.filter((i) => Math.abs(vertex(quay, i)[1] - QUAY_TOP - QUAY_BOLLARD.height) < EPS);
    expect(feet.length).toBeGreaterThan(0);
    expect(tops.length).toBeGreaterThan(0);
    expect(mean(feet.map((i) => luminance(color(quay, i))))).toBeLessThan(mean(tops.map((i) => luminance(color(quay, i)))) * 0.75);
    for (const post of QUAY_BOLLARDS) {
      // The cap's fan repeats its first vertex, so average the ring's distinct positions.
      const own = new Map(tops.filter((i) => Math.hypot(vertex(quay, i)[0] - post.x, vertex(quay, i)[2] - post.z) < 0.02).map((i) => [vertex(quay, i).join(","), vertex(quay, i)]));
      expect(own.size).toBe(8);
      const cx = mean([...own.values()].map((p) => p[0]));
      const cz = mean([...own.values()].map((p) => p[2]));
      const shift = QUAY_BOLLARD.height * Math.tan(QUAY_BOLLARD.lean);
      expect(Math.hypot(cx - post.x, cz - post.z)).toBeCloseTo(shift, 5);
    }
    // The ring: a torus of iron on the sea face, in front of the mortar plane and clear of the base.
    expect(partTriangles("ring").length).toBe(64);
    for (const i of vertices("ring")) {
      const [, y, z] = vertex(quay, i);
      expect(z).toBeGreaterThan(QUAY_SEA_FACE);
      expect(z).toBeLessThan(WALL_FOOT);
      expect(y).toBeGreaterThan(QUAY_COURSE_LEDGES[1]);
      expect(y).toBeLessThan(QUAY_STEP_TOP);
    }
    // The rope coil lies flat on its stone, lower than the posts.
    for (const i of vertices("rope")) {
      const [, y] = vertex(quay, i);
      expect(y).toBeGreaterThanOrEqual(QUAY_TOP - EPS);
      expect(y).toBeLessThanOrEqual(QUAY_TOP + QUAY_ROPE.height + EPS);
    }
    // The crate and the barrel stay inside the deck; the barrel's side shows two stave tones and the iron hoops.
    for (const i of [...vertices("crate"), ...vertices("barrel")]) {
      const [x, y, z] = vertex(quay, i);
      expect(y).toBeGreaterThanOrEqual(QUAY_TOP - EPS);
      expect(x).toBeGreaterThanOrEqual(QUAY_DECK.minX);
      expect(x).toBeLessThanOrEqual(QUAY_DECK.maxX);
      expect(z).toBeGreaterThanOrEqual(QUAY_DECK.minZ);
      expect(z).toBeLessThan(0);
    }
    const sideTones = new Set<number>();
    for (const i of vertices("barrel")) if (Math.abs(normal(quay, i)[1]) < 0.5) sideTones.add(Math.round(luminance(color(quay, i)) * 1e2));
    expect(sideTones.size).toBeGreaterThanOrEqual(3);
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
        expect(coplanarOverlap(tris[i], tris[j], normals[i]), `faces ${i} (${partOf(i * 3)}) and ${j} (${partOf(j * 3)}) overlap in one plane`).toBe(false);
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
          expect(segmentCrossesTriangle(tris[i][k], tris[i][(k + 1) % 3], tris[j]), `edge of face ${i} (${partOf(i * 3)}) crosses face ${j} (${partOf(j * 3)})`).toBe(false);
        }
      }
    }
  });

  it("bakes occlusion: the blocks are dark under the base, lighter mid-wall; the paving stays bright; colours stay in range", () => {
    for (let i = 0; i < quay.vertexCount; i++) for (const v of color(quay, i)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const under: number[] = [];
    const mid: number[] = [];
    for (const i of vertices("blocks")) {
      const [, y] = vertex(quay, i);
      const block = QUAY_WALL_BLOCKS.find((k) => k.course === 0 && Math.abs(y - k.v1) < EPS);
      if (normal(quay, i)[2] < 0.99) continue;
      if (block && !block.stained) under.push(luminance(color(quay, i)));
      if (y > QUAY_COURSE_LEDGES[1] + 0.004 && y < QUAY_COURSE_LEDGES[1] + 0.012) mid.push(luminance(color(quay, i)));
    }
    expect(under.length).toBeGreaterThan(0);
    expect(mid.length).toBeGreaterThan(0);
    expect(mean(under)).toBeLessThan(mean(mid));
    const deck = vertices("paving")
      .filter((i) => vertex(quay, i)[1] > QUAY_PAVING_FLOOR + EPS && normal(quay, i)[1] > 0.9)
      .map((i) => luminance(color(quay, i)));
    expect(mean(deck)).toBeGreaterThan(luminance(colors.stone) * 0.7);
  });

  it("is deterministic", () => {
    expect(buildQuayGeometry(colors).positions).toEqual(quay.positions);
    expect(buildQuayGeometry(colors).colors).toEqual(quay.colors);
  });
});
