import { describe, it, expect } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import {
  CAMERA_FOV,
  CAMERA_MAX_DISTANCE,
  CAMERA_OFFSET,
  CAMERA_PITCH,
  cameraBoundsFromHexes,
  clampToCameraBounds,
  groundViewReach,
  oceanPlaneSize,
} from "./cameraBounds";
import { hexGrid, hexToWorld } from "../game/hex";
import type { Hex } from "../game/hex";

const hex = (q: number, r: number): Hex => ({ q, r, s: -q - r });

describe("the game camera", () => {
  // Civ style on a map that wraps east–west (#36): a screen-horizontal drag
  // must pan along the wrap axis (world x) only, and a vertical one along
  // world z only, so the camera's yaw is aligned with the map axes.
  const camera = new PerspectiveCamera(CAMERA_FOV, 16 / 9, 0.1, 1000);
  camera.position.set(...CAMERA_OFFSET).multiplyScalar(20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  it("sits due south of its focus", () => {
    expect(CAMERA_OFFSET[0]).toBe(0);
    expect(CAMERA_OFFSET[1]).toBeGreaterThan(0);
    expect(CAMERA_OFFSET[2]).toBeGreaterThan(0);
  });

  it("keeps the pitch of the old diagonal view (~46.7° down)", () => {
    expect(CAMERA_PITCH).toBeCloseTo(Math.atan2(0.6, Math.hypot(0.4, 0.4)), 12);
  });

  it("has screen right along world +x", () => {
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    expect(right.x).toBeCloseTo(1, 12);
    expect(right.y).toBeCloseTo(0, 12);
    expect(right.z).toBeCloseTo(0, 12);
  });

  it("shows the ground north of the focus (world −z) straight up the screen", () => {
    const north = new Vector3(0, 0, -5).project(camera);
    expect(north.x).toBeCloseTo(0, 12);
    expect(north.y).toBeGreaterThan(0);
    const east = new Vector3(5, 0, 0).project(camera);
    expect(east.x).toBeGreaterThan(0);
    expect(east.y).toBeCloseTo(0, 12);
  });
});

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
  it("covers the visible reach on every side of a plane centred under the focus", () => {
    expect(oceanPlaneSize(30)).toBe(60);
  });
});
