import { describe, it, expect } from "vitest";
import { PCFSoftShadowMap } from "three";
import {
  SHADOW_CASTER_HEIGHT,
  SHADOW_EXTENT,
  SHADOW_EXTENT_MIN,
  SHADOW_MAP_TYPE,
  sunShadowFor,
} from "./atmosphere";
import { GOLDEN_HOUR, lightingFor } from "./lighting";
import { SEABED_FLOOR_DEPTH } from "./seabedProfile";
import { SEABED_FADE_END, seabedVisibility } from "./waterOptics";
import { metresToUnits, unitsToMetres } from "./worldScale";
import { WAVE_CREST_BOUND_UNITS } from "./waveDisplacement";
import { shadowBoxFor, shadowDepthRange, shadowTexel } from "../shadowFit";
import { CAMERA_MAX_DISTANCE, CAMERA_MIN_DISTANCE } from "../cameraBounds";

const golden = lightingFor(GOLDEN_HOUR);
const SUN_SHADOW = sunShadowFor(golden.sun);

describe("the sun's shadow camera", () => {
  const heights = { min: -metresToUnits(SEABED_FLOOR_DEPTH), max: SHADOW_CASTER_HEIGHT };

  it("fits to the sun's elevation", () => {
    expect(SUN_SHADOW.fit.sunElevationDeg).toBe(golden.sun.elevationDeg);
  });

  it.each([
    ["golden hour", GOLDEN_HOUR],
    ["midday", 12],
  ])("keeps the whole scene between its near and far planes at every box height (%s)", (_label, time) => {
    const { sun } = lightingFor(time);
    const sunDistance = Math.hypot(...sun.offset);
    for (const extent of [SHADOW_EXTENT_MIN, (SHADOW_EXTENT_MIN + SHADOW_EXTENT) / 2, SHADOW_EXTENT]) {
      const { near, far } = shadowDepthRange(extent, sunDistance, sun.elevationDeg, heights);
      expect(near).toBeGreaterThan(SUN_SHADOW.near);
      expect(far).toBeLessThan(SUN_SHADOW.far);
    }
  });

  it("needs no refit for the displaced sea (#38 step 8): its crests stay far inside the scene's height range", () => {
    // The water neither casts nor receives shadows, and the box is fitted to
    // the sea plane's reach plus margins for receivers off it; a crest a few
    // centimetres of a unit high is well within the caster margin, and the
    // troughs within the seabed's.
    expect(WAVE_CREST_BOUND_UNITS).toBeLessThan(SHADOW_CASTER_HEIGHT / 10);
    expect(WAVE_CREST_BOUND_UNITS).toBeLessThan(SUN_SHADOW.fit.receiverDepth / 10);
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

  it("sits at the cap across the sun at full zoom-out and well under it at ship zoom", () => {
    const box = (distance: number) => shadowBoxFor(distance, 16 / 9, SUN_SHADOW.fit);
    const texelMetres = (extent: number) => unitsToMetres(shadowTexel(extent, SUN_SHADOW.mapSize));
    expect(box(CAMERA_MAX_DISTANCE).halfWidth).toBe(SHADOW_EXTENT);
    expect(texelMetres(box(CAMERA_MAX_DISTANCE).halfWidth)).toBeCloseTo(0.79, 2);
    // CAMERA_MIN_DISTANCE is as close as the zoom allows; 3.5 is the ship-zoom design point.
    expect(box(CAMERA_MIN_DISTANCE).halfWidth).toBeLessThan(SHADOW_EXTENT * 0.5);
    expect(texelMetres(box(CAMERA_MIN_DISTANCE).halfWidth)).toBeLessThan(0.38);
    expect(texelMetres(box(3.5).halfWidth)).toBeLessThan(0.34);
  });

  it("keeps the golden-hour shadows sharp at ship zoom: the ground texel down their length stays under 0.45 m", () => {
    // A light-space texel spans texel / sin(elevation) of level ground along the sun.
    const sin = Math.sin((golden.sun.elevationDeg * Math.PI) / 180);
    for (const distance of [CAMERA_MIN_DISTANCE, 3.5]) {
      const along = unitsToMetres(shadowTexel(shadowBoxFor(distance, 16 / 9, SUN_SHADOW.fit).halfHeight, SUN_SHADOW.mapSize)) / sin;
      expect(along).toBeLessThan(0.45);
    }
  });

  it("does not ask for the deprecated PCFSoft filter, which three 0.182 replaces with PCF", () => {
    expect(SHADOW_MAP_TYPE).not.toBe(PCFSoftShadowMap);
  });
});
