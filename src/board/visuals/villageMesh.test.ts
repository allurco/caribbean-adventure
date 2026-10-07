import { describe, it, expect } from "vitest";
import { mergeVillage, roofTint, ROOF_TONES } from "./villageMesh";
import type { FacetGeometryData } from "./facetBuilder";

/** One triangle: a vertex on +z (the front) and two more, all grey. */
const tri: FacetGeometryData = {
  positions: new Float32Array([0, 0, 1, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  colors: new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
  vertexCount: 3,
};

describe("mergeVillage (#84)", () => {
  it("turns, scales and moves each instance as three.js would (front to (sin yaw, cos yaw))", () => {
    const m = mergeVillage([{ data: tri }], [{ source: 0, x: 10, y: 1, z: 20, yaw: Math.PI / 2, scale: 2 }]);
    expect(m.vertexCount).toBe(3);
    expect(m.positions[0]).toBeCloseTo(12, 6);
    expect(m.positions[1]).toBeCloseTo(1, 6);
    expect(m.positions[2]).toBeCloseTo(20, 6);
    expect(m.normals[0]).toBeCloseTo(1, 6);
    expect(m.normals[2]).toBeCloseTo(0, 6);
  });

  it("tints the whole instance and its roof range on top", () => {
    const m = mergeVillage([{ data: tri, roofFrom: 2, roofTo: 3 }], [{ source: 0, x: 0, y: 0, z: 0, yaw: 0, scale: 1, tint: 0.8, roofTint: [1, 0.5, 0.5] }]);
    expect(m.colors[0]).toBeCloseTo(0.4, 6);
    expect(m.colors[6]).toBeCloseTo(0.4, 6);
    expect(m.colors[7]).toBeCloseTo(0.2, 6);
  });

  it("appends world-space extras unchanged after the instances", () => {
    const m = mergeVillage([{ data: tri }], [{ source: 0, x: 0, y: 0, z: 0, yaw: 0, scale: 1 }], [tri]);
    expect(m.vertexCount).toBe(6);
    expect(Array.from(m.positions.slice(9))).toEqual(Array.from(tri.positions));
  });

  it("picks every roof tone across 0…1", () => {
    const picked = new Set<number>();
    for (let t = 0; t < 1; t += 0.01) picked.add(ROOF_TONES.indexOf(roofTint(t)));
    expect(picked.size).toBe(ROOF_TONES.length);
  });
});
