import { describe, it, expect } from "vitest";
import { PCFSoftShadowMap } from "three";
import {
  SHADOW_CASTER_HEIGHT,
  SHADOW_EXTENT,
  SHADOW_EXTENT_MIN,
  SHADOW_MAP_TYPE,
  SUN_DISTANCE,
  SUN_ELEVATION_DEG,
  SUN_SHADOW,
} from "./atmosphere";
import { SEABED_FLOOR_DEPTH } from "./seabedProfile";
import { SEABED_FADE_END, seabedVisibility } from "./waterOptics";
import { metresToUnits, unitsToMetres } from "./worldScale";
import { shadowDepthRange, shadowExtentFor, shadowTexel } from "../shadowFit";
import { CAMERA_MAX_DISTANCE } from "../cameraBounds";

describe("the sun's shadow camera", () => {
  const heights = { min: -metresToUnits(SEABED_FLOOR_DEPTH), max: SHADOW_CASTER_HEIGHT };

  it("keeps the whole scene between its near and far planes at every box extent", () => {
    for (const extent of [SHADOW_EXTENT_MIN, (SHADOW_EXTENT_MIN + SHADOW_EXTENT) / 2, SHADOW_EXTENT]) {
      const { near, far } = shadowDepthRange(extent, SUN_DISTANCE, SUN_ELEVATION_DEG, heights);
      expect(near).toBeGreaterThan(SUN_SHADOW.near);
      expect(far).toBeLessThan(SUN_SHADOW.far);
    }
  });

  it("fits the box between a usable floor and the old fixed extent", () => {
    expect(SUN_SHADOW.fit.minExtent).toBeGreaterThan(0);
    expect(SUN_SHADOW.fit.minExtent).toBeLessThan(SUN_SHADOW.fit.maxExtent);
    expect(SUN_SHADOW.fit.maxExtent).toBe(25);
  });

  it("fits the box around the deepest seabed that can still be seen through the water", () => {
    expect(SUN_SHADOW.fit.receiverDepth).toBe(metresToUnits(SEABED_FADE_END));
    // Nothing of the seabed reaches the surface from there down, so deeper shadows are never seen.
    expect(seabedVisibility(SEABED_FADE_END)).toBe(0);
    expect(SUN_SHADOW.fit.receiverDepth).toBeLessThan(metresToUnits(SEABED_FLOOR_DEPTH));
  });

  it("sits at the cap at full zoom-out and well under it at ship zoom", () => {
    const texelMetres = (distance: number) =>
      unitsToMetres(shadowTexel(shadowExtentFor(distance, 16 / 9, SUN_SHADOW.fit), SUN_SHADOW.mapSize));
    expect(shadowExtentFor(CAMERA_MAX_DISTANCE, 16 / 9, SUN_SHADOW.fit)).toBe(SHADOW_EXTENT);
    expect(texelMetres(CAMERA_MAX_DISTANCE)).toBeCloseTo(0.79, 2);
    // 4.3 is as close as the small map's minDistance allows; 3.5 is the ship-zoom design point.
    expect(shadowExtentFor(4.3, 16 / 9, SUN_SHADOW.fit)).toBeLessThan(SHADOW_EXTENT * 0.5);
    expect(texelMetres(4.3)).toBeLessThan(0.38);
    expect(texelMetres(3.5)).toBeLessThan(0.34);
  });

  it("does not ask for the deprecated PCFSoft filter, which three 0.182 replaces with PCF", () => {
    expect(SHADOW_MAP_TYPE).not.toBe(PCFSoftShadowMap);
  });
});
