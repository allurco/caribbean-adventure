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
import { metresToUnits } from "./worldScale";
import { shadowDepthRange } from "../shadowFit";

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

  it("does not ask for the deprecated PCFSoft filter, which three 0.182 replaces with PCF", () => {
    expect(SHADOW_MAP_TYPE).not.toBe(PCFSoftShadowMap);
  });
});
