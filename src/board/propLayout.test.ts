import { describe, it, expect } from "vitest";
import { layoutRow, propExtent, PROP_ROW_MIN_GAP, PROP_SHADOW_REACH } from "./propLayout";

const box = (hw: number, h: number) => ({
  positions: new Float32Array([-hw, 0, -hw, hw, 0, hw, hw, h, 0, -hw, h, -hw]),
  normals: new Float32Array(12),
  vertexCount: 4,
});

describe("propExtent", () => {
  it("measures a piece's plan radius and height at its scale", () => {
    const one = propExtent(box(0.1, 0.3), 1);
    expect(one.radius).toBeCloseTo(Math.hypot(0.1, 0.1), 6);
    expect(one.height).toBeCloseTo(0.3, 6);
    const two = propExtent(box(0.1, 0.3), 2);
    expect(two.radius).toBeCloseTo(2 * Math.hypot(0.1, 0.1), 6);
    expect(two.height).toBeCloseTo(0.6, 6);
  });
});

describe("layoutRow", () => {
  const extents = [
    { radius: 0.3, height: 0.25 },
    { radius: 0.35, height: 0.3 },
    { radius: 0.1, height: 0.2 },
    { radius: 0.15, height: 0.2 },
  ];
  const xs = layoutRow(extents);

  it("keeps the order and leaves a gap between footprints that also clears the taller piece's shadow", () => {
    for (let i = 1; i < xs.length; i++) {
      const gap = xs[i] - xs[i - 1] - extents[i - 1].radius - extents[i].radius;
      expect(gap).toBeGreaterThanOrEqual(PROP_ROW_MIN_GAP - 1e-9);
      expect(gap).toBeGreaterThanOrEqual(extents[i - 1].height * PROP_SHADOW_REACH - 1e-9);
      expect(gap).toBeLessThan(0.5);
    }
  });

  it("centres the row on the origin", () => {
    const left = xs[0] - extents[0].radius;
    const right = xs[xs.length - 1] + extents[extents.length - 1].radius;
    expect(left + right).toBeCloseTo(0, 9);
  });

  it("puts a single piece at the origin and copes with none", () => {
    expect(layoutRow([{ radius: 1, height: 1 }])).toEqual([0]);
    expect(layoutRow([])).toEqual([]);
  });
});
