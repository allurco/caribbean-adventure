import { describe, expect, it } from "vitest";
import { CAMERA_DIRECTION, CAMERA_MIN_DISTANCE } from "./cameraBounds";
import {
  CAMERA_GROUND_CLEARANCE,
  GROUND_FOLLOW_FAR,
  GROUND_FOLLOW_NEAR,
  focusHeight,
  groundFollowWeight,
} from "./groundFollow";

const flat = (h: number) => () => h;

describe("groundFollowWeight", () => {
  it("is 0 from today's old zoom floor out, so map and mid zoom are unchanged", () => {
    expect(GROUND_FOLLOW_FAR).toBeCloseTo(4.32, 12);
    expect(groundFollowWeight(GROUND_FOLLOW_FAR)).toBe(0);
    expect(groundFollowWeight(10)).toBe(0);
    expect(groundFollowWeight(28)).toBe(0);
  });

  it("is 1 from the near distance in, down to the zoom floor", () => {
    expect(GROUND_FOLLOW_NEAR).toBeLessThan(GROUND_FOLLOW_FAR);
    expect(GROUND_FOLLOW_NEAR).toBeGreaterThan(CAMERA_MIN_DISTANCE);
    expect(groundFollowWeight(GROUND_FOLLOW_NEAR)).toBe(1);
    expect(groundFollowWeight(CAMERA_MIN_DISTANCE)).toBe(1);
  });

  it("eases monotonically in between", () => {
    let last = 1;
    for (let d = GROUND_FOLLOW_NEAR; d <= GROUND_FOLLOW_FAR; d += 0.05) {
      const w = groundFollowWeight(d);
      expect(w).toBeLessThanOrEqual(last + 1e-12);
      last = w;
    }
  });
});

describe("focusHeight", () => {
  it("stays on the sea plane at map and mid zoom, whatever the ground", () => {
    expect(focusHeight({ x: 0, z: 0 }, 8, flat(1.2))).toBe(0);
    expect(focusHeight({ x: 0, z: 0 }, GROUND_FOLLOW_FAR, flat(1.9))).toBe(0);
  });

  it("never drops below the sea plane over water", () => {
    expect(focusHeight({ x: 0, z: 0 }, CAMERA_MIN_DISTANCE, flat(-1.5))).toBe(0);
  });

  it("sits on the ground at town zoom", () => {
    expect(focusHeight({ x: 3, z: 4 }, CAMERA_MIN_DISTANCE, flat(0.75))).toBeCloseTo(0.75, 12);
  });

  it("blends partway onto the ground between the near and far distances", () => {
    const mid = (GROUND_FOLLOW_NEAR + GROUND_FOLLOW_FAR) / 2;
    const h = focusHeight({ x: 0, z: 0 }, mid, flat(1));
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(1);
  });

  it("averages the ground round the focus, so one spike does not jolt the view", () => {
    const spike = (x: number, z: number) => (x === 0 && z === 0 ? 1 : 0.5);
    const h = focusHeight({ x: 0, z: 0 }, CAMERA_MIN_DISTANCE, spike);
    expect(h).toBeGreaterThan(0.5);
    expect(h).toBeLessThan(1);
  });

  it("is continuous as the focus pans over a slope", () => {
    const slope = (_x: number, z: number) => Math.max(0, 1 - 0.5 * z);
    let last = focusHeight({ x: 0, z: -1 }, CAMERA_MIN_DISTANCE, slope);
    for (let z = -1; z <= 3; z += 0.01) {
      const h = focusHeight({ x: 0, z }, CAMERA_MIN_DISTANCE, slope);
      expect(Math.abs(h - last)).toBeLessThan(0.02);
      last = h;
    }
  });

  // The camera sits south of the focus (+z): a hill there, between the camera
  // and a low focus, would otherwise swallow the camera.
  it("lifts the focus so the camera and its line of sight clear a hill behind the town", () => {
    const d = CAMERA_MIN_DISTANCE;
    // Sea at the focus, rising to a 1.4-high ridge before the camera.
    const ridge = (_x: number, z: number) => {
      const t = Math.min(1, Math.max(0, (z - 0.1) / 0.3));
      return -0.2 + 1.6 * t * t * (3 - 2 * t);
    };
    const y = focusHeight({ x: 0, z: 0 }, d, ridge);
    expect(y + d * CAMERA_DIRECTION[1]).toBeGreaterThanOrEqual(ridge(0, d * CAMERA_DIRECTION[2]) + CAMERA_GROUND_CLEARANCE - 1e-9);
    for (let s = 0; s <= 0.6; s += 0.02) {
      const rayY = y + (1 - s) * d * CAMERA_DIRECTION[1];
      const rayZ = (1 - s) * d * CAMERA_DIRECTION[2];
      // Sampled, not solved: within a few centimetres between samples.
      expect(rayY).toBeGreaterThan(ridge(0, rayZ) + CAMERA_GROUND_CLEARANCE - 0.05);
    }
  });

  it("does not lift the camera at map zoom, where it flies far above the highest ground", () => {
    expect(focusHeight({ x: 0, z: 0 }, GROUND_FOLLOW_FAR, flat(1.9))).toBe(0);
  });
});
