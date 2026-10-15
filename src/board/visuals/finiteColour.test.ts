import { describe, expect, it } from "vitest";
import { FINITE_COLOUR_GLSL, finiteColour, HDR_COLOUR_MAX, SUN_GLINT_MAX } from "./finiteColour";
import { lightingFor } from "./lighting";
import { REGION_CHART_GLSL } from "./regionChart";
import { sunGlintRadiance } from "./sunGlint";
import { GLINT_BASE_ROUGHNESS2 } from "./oceanWaves";
import type { Vec3 } from "./sunDirection";
import { CAMERA_DIRECTION, CAMERA_FOV } from "../cameraBounds";

describe("finiteColour: no NaN or Infinity reaches the post-processing", () => {
  it("leaves an ordinary HDR colour as it is", () => {
    expect(finiteColour([0.2, 1.5, 12], HDR_COLOUR_MAX)).toEqual([0.2, 1.5, 12]);
  });

  it("holds an overflowing channel to the cap", () => {
    expect(finiteColour([Infinity, 1e9, 0.5], 64)).toEqual([64, 64, 0.5]);
  });

  it("turns a colour with a NaN in it to black, not a NaN the bloom would spread over the frame", () => {
    expect(finiteColour([NaN, 0.4, 0.4], 64)).toEqual([0, 0, 0]);
  });

  it("never gives a negative channel", () => {
    expect(finiteColour([-Infinity, -0.1, 0.3], 64)).toEqual([0, 0, 0.3]);
  });

  it("caps well below a half float's largest value, so the bloom's summed mips never reach Infinity", () => {
    expect(HDR_COLOUR_MAX * 4).toBeLessThan(65504);
    expect(SUN_GLINT_MAX).toBeLessThanOrEqual(HDR_COLOUR_MAX);
  });

  it("catches only broken glints: the brightest real sparkle, at any hour and anywhere in the view, is an order of magnitude under the cap", () => {
    // The camera never rotates: every view ray is within the FOV of CAMERA_DIRECTION (aspect up to 2.4).
    const norm = (a: readonly number[]): Vec3 => {
      const l = Math.hypot(...a);
      return [a[0] / l, a[1] / l, a[2] / l];
    };
    const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const forward: Vec3 = [-CAMERA_DIRECTION[0], -CAMERA_DIRECTION[1], -CAMERA_DIRECTION[2]];
    const right = norm(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    const t = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
    let brightest = 0;
    for (let hour = 0; hour < 24; hour += 0.25) {
      const { sun } = lightingFor(hour);
      const l = sun.direction;
      if (sun.intensity <= 0 || l[1] <= 0) continue;
      for (let sy = -1; sy <= 1; sy += 0.05) {
        for (let sx = -2.4; sx <= 2.4; sx += 0.05) {
          const ray = [0, 1, 2].map((i) => forward[i] + sy * t * up[i] + sx * t * right[i]);
          const v = norm(ray.map((x) => -x)); // toward the eye
          const n = norm([v[0] + l[0], v[1] + l[1], v[2] + l[2]]); // the facet that mirrors the sun into it
          brightest = Math.max(brightest, sunGlintRadiance(n, v, l, GLINT_BASE_ROUGHNESS2, sun.intensity));
        }
      }
    }
    expect(brightest).toBeGreaterThan(64); // the old cap of 64 dimmed real sparkles
    expect(brightest * 10).toBeLessThanOrEqual(SUN_GLINT_MAX);
  });

  it("finds NaN and Infinity in the shaders from the float's bits, which fast-math cannot fold away", () => {
    for (const glsl of [FINITE_COLOUR_GLSL, REGION_CHART_GLSL]) {
      expect(glsl).not.toMatch(/\bis(nan|inf)\s*\(/);
    }
    expect(FINITE_COLOUR_GLSL).toMatch(/floatBitsToUint/);
    expect(FINITE_COLOUR_GLSL).toMatch(/0x7f800000u/);
    expect(REGION_CHART_GLSL).toMatch(/finiteColour\(glint, SUN_GLINT_MAX\)/);
  });
});
