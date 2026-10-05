import { describe, it, expect } from "vitest";
import { CAMERA_FOV, CAMERA_MAX_DISTANCE, CAMERA_PITCH, groundViewReach } from "./cameraBounds";
import {
  shadowBoxNeedsRefit,
  shadowDepthBias,
  shadowDepthRange,
  shadowExtentFor,
  shadowTexel,
  type ShadowFit,
} from "./shadowFit";

const fit: ShadowFit = {
  pitch: CAMERA_PITCH,
  fovDeg: CAMERA_FOV,
  sunElevationDeg: 55,
  casterHeight: 2.6,
  minExtent: 4,
  maxExtent: 25,
};
const margin = fit.casterHeight * Math.cos((fit.sunElevationDeg * Math.PI) / 180);

describe("shadowExtentFor", () => {
  it("covers the furthest visible sea point plus the caster margin", () => {
    const reach = groundViewReach(8, CAMERA_PITCH, CAMERA_FOV, 16 / 9);
    expect(shadowExtentFor(8, 16 / 9, fit)).toBeCloseTo(reach + margin, 10);
  });

  it("never exceeds the maximum: at full zoom-out the box stays today's size", () => {
    expect(shadowExtentFor(CAMERA_MAX_DISTANCE, 16 / 9, fit)).toBe(fit.maxExtent);
    expect(shadowExtentFor(1000, 4, fit)).toBe(fit.maxExtent);
  });

  it("never drops below the minimum, however close the camera", () => {
    expect(shadowExtentFor(0.5, 16 / 9, fit)).toBe(fit.minExtent);
    expect(shadowExtentFor(0, 16 / 9, fit)).toBe(fit.minExtent);
  });

  it("is at most the maximum when the view reaches the horizon", () => {
    expect(shadowExtentFor(10, 1, { ...fit, pitch: (10 * Math.PI) / 180 })).toBe(fit.maxExtent);
  });

  it("shrinks as the camera zooms in, so the shadow texel gets finer", () => {
    const map = shadowExtentFor(CAMERA_MAX_DISTANCE, 16 / 9, fit);
    const mid = shadowExtentFor(12, 16 / 9, fit);
    const ship = shadowExtentFor(3.5, 16 / 9, fit);
    expect(mid).toBeLessThan(map);
    expect(ship).toBeLessThan(mid);
    // Ship zoom on a 16:9 screen gets a texel roughly 3.5–4× finer than map zoom.
    expect(map / ship).toBeGreaterThan(3.4);
    expect(map / ship).toBeLessThan(4.2);
  });

  it("grows with a wider viewport", () => {
    expect(shadowExtentFor(6, 3, fit)).toBeGreaterThan(shadowExtentFor(6, 16 / 9, fit));
  });

  it("is never larger than a box centred on the target needs for the visible sea", () => {
    // The sea footprint at the same distance, without the caster margin, is strictly inside the box.
    for (const distance of [2, 4, 8, 12, 16]) {
      const reach = groundViewReach(distance, CAMERA_PITCH, CAMERA_FOV, 16 / 9);
      expect(shadowExtentFor(distance, 16 / 9, fit)).toBeGreaterThanOrEqual(Math.min(reach, fit.maxExtent));
    }
  });
});

describe("shadowTexel", () => {
  it("is the box width over the map size", () => {
    expect(shadowTexel(25, 4096)).toBeCloseTo(50 / 4096, 12);
  });

  it("is about 0.8 m at map zoom and about 0.2 m at ship zoom (65 m per unit)", () => {
    const metres = (extent: number) => shadowTexel(extent, 4096) * 65;
    expect(metres(shadowExtentFor(CAMERA_MAX_DISTANCE, 16 / 9, fit))).toBeCloseTo(0.79, 1);
    expect(metres(shadowExtentFor(3.5, 16 / 9, fit))).toBeLessThan(0.25);
  });
});

describe("shadowDepthBias", () => {
  it("reproduces today's bias (−0.0001) at the old fixed extent for ~1.2 texels", () => {
    const texel = shadowTexel(25, 4096);
    expect(shadowDepthBias(1.2, texel, 0.5, 150)).toBeCloseTo(-0.0001, 5);
  });

  it("shrinks with the texel so the bias stays the same number of texels deep", () => {
    const wide = shadowDepthBias(1.2, shadowTexel(25, 4096), 0.5, 150);
    const tight = shadowDepthBias(1.2, shadowTexel(6.25, 4096), 0.5, 150);
    expect(tight).toBeCloseTo(wide / 4, 12);
    expect(tight).toBeLessThan(0);
  });
});

describe("shadowBoxNeedsRefit", () => {
  it("ignores changes within the hysteresis band", () => {
    expect(shadowBoxNeedsRefit(10, 10.4, 0.05)).toBe(false);
    expect(shadowBoxNeedsRefit(10, 9.6, 0.05)).toBe(false);
    expect(shadowBoxNeedsRefit(10, 10, 0.05)).toBe(false);
  });

  it("refits once the extent moves more than the band, either way", () => {
    expect(shadowBoxNeedsRefit(10, 10.6, 0.05)).toBe(true);
    expect(shadowBoxNeedsRefit(10, 9.4, 0.05)).toBe(true);
  });

  it("always refits from an unset box", () => {
    expect(shadowBoxNeedsRefit(undefined, 10, 0.05)).toBe(true);
  });
});

describe("shadowDepthRange", () => {
  // The sun sits 70 units from the target along SUN_DIRECTION (55° up); the
  // scene spans the seabed floor (−1.9) to a palm on a mountain peak (+2.6).
  const sunDistance = 70;
  const heights = { min: -1.9, max: 2.6 };

  it("spans the box's tilt across the ground plus the height range along the sun", () => {
    const { near, far } = shadowDepthRange(25, sunDistance, 55, heights);
    const cot = 1 / Math.tan((55 * Math.PI) / 180);
    const csc = 1 / Math.sin((55 * Math.PI) / 180);
    expect(near).toBeCloseTo(70 - 25 * cot - 2.6 * csc, 10);
    expect(far).toBeCloseTo(70 + 25 * cot + 1.9 * csc, 10);
  });

  it("fits inside the shadow camera's near and far planes at every extent", () => {
    for (const extent of [fit.minExtent, 10, fit.maxExtent]) {
      const { near, far } = shadowDepthRange(extent, sunDistance, 55, heights);
      expect(near).toBeGreaterThan(0.5);
      expect(far).toBeLessThan(150);
    }
  });

  it("is narrowest at the minimum extent and still encloses the height range", () => {
    const small = shadowDepthRange(fit.minExtent, sunDistance, 55, heights);
    const large = shadowDepthRange(fit.maxExtent, sunDistance, 55, heights);
    expect(small.far - small.near).toBeLessThan(large.far - large.near);
    expect(small.far - small.near).toBeGreaterThan(heights.max - heights.min);
  });
});
