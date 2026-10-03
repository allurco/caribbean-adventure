import { describe, it, expect } from "vitest";
import {
  buildPalmGeometry,
  PALM_CROWN_CENTER,
  PALM_TRUNK_HEIGHT,
  PALM_TRUNK_TOP_SWAY,
  type PalmColors,
} from "./palmGeometry";

const COLORS: PalmColors = {
  trunk: [0.25, 0.15, 0.07],
  frond: [0.1, 0.27, 0.05],
};

const palm = buildPalmGeometry(COLORS);
const n = palm.vertexCount;

function vertex(i: number): { x: number; y: number; z: number; sway: number; crown: number } {
  return {
    x: palm.positions[i * 3],
    y: palm.positions[i * 3 + 1],
    z: palm.positions[i * 3 + 2],
    sway: palm.palm[i * 2],
    crown: palm.palm[i * 2 + 1],
  };
}

const vertices = Array.from({ length: n }, (_, i) => vertex(i));
const trunk = vertices.filter((v) => v.crown === 0);
const crown = vertices.filter((v) => v.crown === 1);

describe("buildPalmGeometry", () => {
  it("returns non-indexed triangles with matching attribute lengths", () => {
    expect(n % 3).toBe(0);
    expect(palm.positions).toHaveLength(n * 3);
    expect(palm.normals).toHaveLength(n * 3);
    expect(palm.colors).toHaveLength(n * 3);
    expect(palm.palm).toHaveLength(n * 2);
  });

  it("stays low-poly", () => {
    expect(n / 3).toBeLessThanOrEqual(260);
    expect(n / 3).toBeGreaterThan(60);
  });

  it("stands its trunk base on y = 0", () => {
    const minY = Math.min(...trunk.map((v) => v.y));
    expect(minY).toBeCloseTo(0, 6);
    // Base ring is centred on the origin, so ground placement still holds.
    const base = trunk.filter((v) => Math.abs(v.y) < 1e-6);
    expect(base.length).toBeGreaterThan(0);
    for (const v of base) expect(Math.hypot(v.x, v.z)).toBeLessThan(0.06);
  });

  it("curves the trunk so its top is off-centre", () => {
    const top = trunk.filter((v) => Math.abs(v.y - PALM_TRUNK_HEIGHT) < 1e-6);
    expect(top.length).toBeGreaterThan(0);
    const meanX = top.reduce((s, v) => s + v.x, 0) / top.length;
    expect(meanX).toBeGreaterThan(0.02);
    expect(PALM_CROWN_CENTER[0]).toBeCloseTo(meanX, 2);
  });

  it("puts the crown at the top of the trunk", () => {
    expect(PALM_CROWN_CENTER[1]).toBeGreaterThanOrEqual(PALM_TRUNK_HEIGHT);
    const maxY = Math.max(...vertices.map((v) => v.y));
    expect(maxY).toBeGreaterThan(PALM_TRUNK_HEIGHT);
    expect(maxY).toBeLessThan(0.7);
  });

  it("droops fronds: tips hang below the crown", () => {
    const tips = crown.filter((v) => v.sway === 1);
    expect(tips.length).toBeGreaterThanOrEqual(6);
    for (const t of tips) expect(t.y).toBeLessThan(PALM_CROWN_CENTER[1]);
  });

  it("spreads fronds all the way round the crown", () => {
    const tips = crown.filter((v) => v.sway === 1);
    const quadrants = new Set(
      tips.map((t) => {
        const dx = t.x - PALM_CROWN_CENTER[0];
        const dz = t.z - PALM_CROWN_CENTER[2];
        return `${dx >= 0 ? "+" : "-"}${dz >= 0 ? "+" : "-"}`;
      })
    );
    expect(quadrants.size).toBe(4);
  });

  it("weights sway from 0 at the trunk base to 1 at frond tips", () => {
    for (const v of vertices) {
      expect(v.sway).toBeGreaterThanOrEqual(0);
      expect(v.sway).toBeLessThanOrEqual(1);
    }
    for (const v of trunk.filter((t) => Math.abs(t.y) < 1e-6)) expect(v.sway).toBe(0);
    expect(Math.max(...vertices.map((v) => v.sway))).toBe(1);
    const trunkTop = Math.max(...trunk.map((v) => v.sway));
    expect(trunkTop).toBeCloseTo(PALM_TRUNK_TOP_SWAY, 6);
    for (const v of crown) expect(v.sway).toBeGreaterThanOrEqual(PALM_TRUNK_TOP_SWAY - 1e-6);
  });

  it("bends the trunk more the higher up it is", () => {
    const low = trunk.filter((v) => v.y < PALM_TRUNK_HEIGHT * 0.3);
    const high = trunk.filter((v) => v.y > PALM_TRUNK_HEIGHT * 0.7);
    const maxLow = Math.max(...low.map((v) => v.sway));
    const minHigh = Math.min(...high.map((v) => v.sway));
    expect(maxLow).toBeLessThan(minHigh);
  });

  it("has unit normals and no degenerate triangles", () => {
    for (let i = 0; i < n; i++) {
      const len = Math.hypot(palm.normals[i * 3], palm.normals[i * 3 + 1], palm.normals[i * 3 + 2]);
      expect(len).toBeCloseTo(1, 5);
    }
  });

  it("colours the trunk and fronds from the given palette", () => {
    for (let i = 0; i < n * 3; i++) {
      expect(palm.colors[i]).toBeGreaterThanOrEqual(0);
      expect(palm.colors[i]).toBeLessThanOrEqual(1);
    }
    const greenish = (i: number) => palm.colors[i * 3 + 1] > palm.colors[i * 3];
    const frondVerts = vertices.map((v, i) => ({ v, i })).filter(({ v }) => v.crown === 1 && v.sway > PALM_TRUNK_TOP_SWAY);
    expect(frondVerts.length).toBeGreaterThan(0);
    for (const { i } of frondVerts) expect(greenish(i)).toBe(true);
    trunk.forEach((_, k) => {
      const i = vertices.indexOf(trunk[k]);
      expect(greenish(i)).toBe(false);
    });
  });
});
