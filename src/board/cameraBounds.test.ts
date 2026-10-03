import { describe, it, expect } from "vitest";
import {
  CAMERA_FOV,
  CAMERA_MAX_DISTANCE,
  CAMERA_PITCH,
  cameraBoundsFromHexes,
  cameraBoundsExtent,
  clampToCameraBounds,
  groundViewReach,
  oceanPlaneSize,
} from "./cameraBounds";
import { hexGrid, hexToWorld } from "../game/hex";
import type { Hex } from "../game/hex";

const hex = (q: number, r: number): Hex => ({ q, r, s: -q - r });

describe("cameraBoundsFromHexes", () => {
  it("wraps every cell centre", () => {
    const cells = hexGrid(4);
    const bounds = cameraBoundsFromHexes(cells, 0);
    cells.forEach((h) => {
      const [x, , z] = hexToWorld(h);
      const { dx, dz } = clampToCameraBounds(bounds, x, z);
      expect(dx).toBeCloseTo(0);
      expect(dz).toBeCloseTo(0);
    });
  });

  it("keeps only the outer corner hexes of a hexagonal map as the hull", () => {
    const bounds = cameraBoundsFromHexes(hexGrid(5), 1);
    expect(bounds.hull).toHaveLength(6);
    expect(bounds.padding).toBe(1);
  });
});

describe("clampToCameraBounds", () => {
  const radius = 6;
  const padding = 2;
  const bounds = cameraBoundsFromHexes(hexGrid(radius), padding);
  const [edgeX] = hexToWorld(hex(radius, 0)); // flat east side at x = 1.5 * radius

  it("leaves a point inside the map untouched", () => {
    expect(clampToCameraBounds(bounds, 1, -2)).toEqual({ x: 1, z: -2, dx: 0, dz: 0 });
  });

  it("allows the focus to sit within the padding outside the map", () => {
    const { dx, dz } = clampToCameraBounds(bounds, edgeX + padding * 0.5, 0);
    expect(dx).toBe(0);
    expect(dz).toBe(0);
  });

  it("pulls a far-off point back onto the padded edge and returns the correction", () => {
    const out = clampToCameraBounds(bounds, edgeX + 50, 0);
    expect(out.x).toBeCloseTo(edgeX + padding);
    expect(out.z).toBeCloseTo(0);
    expect(out.dx).toBeCloseTo(out.x - (edgeX + 50));
    expect(out.dz).toBeCloseTo(0);
  });

  it("pulls a point off the map corner back towards the corner hex", () => {
    const [cx, , cz] = hexToWorld(hex(0, -radius)); // northernmost corner hex
    const out = clampToCameraBounds(bounds, cx, cz - 40);
    expect(Math.hypot(out.x - cx, out.z - cz)).toBeCloseTo(padding);
  });

  it("never leaves the padded bounds, wherever the point starts", () => {
    for (let a = 0; a < 360; a += 15) {
      const rad = (a * Math.PI) / 180;
      const out = clampToCameraBounds(bounds, Math.cos(rad) * 500, Math.sin(rad) * 500);
      const again = clampToCameraBounds(bounds, out.x, out.z);
      expect(Math.abs(again.dx)).toBeLessThan(1e-9);
      expect(Math.abs(again.dz)).toBeLessThan(1e-9);
      expect(Math.hypot(out.x, out.z)).toBeLessThanOrEqual(Math.sqrt(3) * radius + padding + 1e-9);
    }
  });

  it("clamps to the padded point for a single-cell map", () => {
    const single = cameraBoundsFromHexes([hex(0, 0)], 1);
    const out = clampToCameraBounds(single, 10, 0);
    expect(out.x).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0);
  });

  it("does nothing without cells", () => {
    const empty = cameraBoundsFromHexes([], 1);
    expect(clampToCameraBounds(empty, 99, -99)).toEqual({ x: 99, z: -99, dx: 0, dz: 0 });
  });
});

describe("cameraBoundsExtent", () => {
  it("is the largest |x| or |z| the clamped focus can reach", () => {
    const radius = 6;
    const bounds = cameraBoundsFromHexes(hexGrid(radius), 2);
    // Hexagonal map is pointy along z: corner hexes sit at z = +-sqrt(3) * radius.
    expect(cameraBoundsExtent(bounds)).toBeCloseTo(Math.sqrt(3) * radius + 2);
  });
});

describe("groundViewReach", () => {
  const halfFov = (CAMERA_FOV / 2) * (Math.PI / 180);

  it("matches the frustum footprint for a straight-down camera", () => {
    const d = 10;
    const aspect = 2;
    const t = Math.tan(halfFov);
    expect(groundViewReach(d, Math.PI / 2, CAMERA_FOV, aspect)).toBeCloseTo(
      d * t * Math.hypot(1, aspect)
    );
  });

  it("scales linearly with camera distance", () => {
    const near = groundViewReach(10, CAMERA_PITCH, CAMERA_FOV, 16 / 9);
    const far = groundViewReach(20, CAMERA_PITCH, CAMERA_FOV, 16 / 9);
    expect(far).toBeCloseTo(near * 2);
  });

  it("grows with a wider viewport", () => {
    expect(groundViewReach(28, CAMERA_PITCH, CAMERA_FOV, 3)).toBeGreaterThan(
      groundViewReach(28, CAMERA_PITCH, CAMERA_FOV, 16 / 9)
    );
  });

  it("is infinite when the top of the view reaches the horizon", () => {
    expect(groundViewReach(10, (10 * Math.PI) / 180, CAMERA_FOV, 1)).toBe(Infinity);
  });

  it("stays finite for the game camera at full zoom-out", () => {
    const reach = groundViewReach(CAMERA_MAX_DISTANCE, CAMERA_PITCH, CAMERA_FOV, 4);
    expect(Number.isFinite(reach)).toBe(true);
    expect(reach).toBeGreaterThan(CAMERA_MAX_DISTANCE);
  });
});

describe("oceanPlaneSize", () => {
  it("covers the clamped focus range plus the visible reach on every side", () => {
    const bounds = cameraBoundsFromHexes(hexGrid(6), 2);
    expect(oceanPlaneSize(bounds, 30)).toBeCloseTo(2 * (cameraBoundsExtent(bounds) + 30));
  });
});
