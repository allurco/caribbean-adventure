import { describe, expect, it } from "vitest";
import { mainMastCut, mastStations, splitTriangles } from "./mastSplit";

// Model metres: two masts as vertical lines of points, the fore at z = -8 (top 20 m), the main at z = 2 (top 30 m).
const mastPoints = (z: number, top: number) => [0, 4, z, 0, top / 2, z, 0, top, z, 0.3, top, z + 0.3];
const MASTS = new Float32Array([...mastPoints(-8, 20), ...mastPoints(2, 30)]);

describe("finding the masts", () => {
  it("clusters the mast geometry by station along the keel", () => {
    const stations = mastStations(MASTS, 3);
    expect(stations.map((s) => Math.round(s.z))).toEqual([-8, 2]);
    expect(stations.map((s) => s.top)).toEqual([20, 30]);
  });

  it("breaks the tallest mast part way up, over the stretch of keel that is its own", () => {
    const cut = mainMastCut(mastStations(MASTS, 3), { deckY: 4, breakShare: 0.4 });
    expect(cut.pivot[2]).toBeCloseTo(2, 0);
    expect(cut.pivot[1]).toBeCloseTo(4 + 0.4 * 26, 6);
    expect(cut.zMin).toBeCloseTo(-3, 0); // half-way to the foremast
    expect(cut.zMax).toBeGreaterThan(2);
  });
});

describe("splitting triangles", () => {
  it("cuts the triangles above the break within the main mast's stretch, keeping the rest", () => {
    // Three triangles: low on the main mast, high on the main mast, high on the foremast.
    const positions = new Float32Array([
      0, 5, 2, 0.1, 6, 2, 0, 7, 2.1,
      0, 25, 2, 0.1, 26, 2, 0, 27, 2.1,
      0, 18, -8, 0.1, 19, -8, 0, 19, -7.9,
    ]);
    const index = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const { kept, cut } = splitTriangles(positions, index, { zMin: -3, zMax: 8, yBreak: 14 });
    expect([...cut]).toEqual([3, 4, 5]);
    expect([...kept]).toEqual([0, 1, 2, 6, 7, 8]);
  });
});
