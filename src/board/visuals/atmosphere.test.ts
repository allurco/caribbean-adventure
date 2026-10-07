import { describe, it, expect } from "vitest";
import { PCFSoftShadowMap } from "three";
import {
  FILL_AZIMUTH_DEG,
  FILL_DIRECTION,
  FILL_ELEVATION_DEG,
  FILL_INTENSITY,
  FILL_OFFSET,
  SHADOW_CASTER_HEIGHT,
  SHADOW_EXTENT,
  SHADOW_EXTENT_MIN,
  SHADOW_MAP_TYPE,
  SUN_AZIMUTH_DEG,
  SUN_DIRECTION,
  SUN_DISTANCE,
  SUN_ELEVATION_DEG,
  SUN_INTENSITY,
  SUN_SHADOW,
} from "./atmosphere";
import { SEABED_FLOOR_DEPTH } from "./seabedProfile";
import { SEABED_FADE_END, seabedVisibility } from "./waterOptics";
import { metresToUnits, unitsToMetres } from "./worldScale";
import { WAVE_CREST_BOUND_UNITS } from "./waveDisplacement";
import { viewDirectionXZ } from "./sunDirection";
import { shadowDepthRange, shadowExtentFor, shadowTexel } from "../shadowFit";
import { CAMERA_DIRECTION, CAMERA_MAX_DISTANCE, CAMERA_MIN_DISTANCE } from "../cameraBounds";

describe("the fill light (#63)", () => {
  const view = viewDirectionXZ(CAMERA_DIRECTION);
  /** How much of a light's horizontal direction points the way the camera looks. */
  const alongView = (direction: readonly [number, number, number]) =>
    direction[0] * view[0] + direction[2] * view[1];

  it("comes from behind the camera, where the sun is in front of it", () => {
    // Every wall the player sees faces the camera, and so faces away from a
    // sun in front of it; only a light from behind the camera reaches them.
    expect(alongView(SUN_DIRECTION)).toBeGreaterThan(0);
    expect(alongView(FILL_DIRECTION)).toBeLessThan(0);
  });

  it("swings to the opposite side of the view from the sun", () => {
    expect(Math.sign(FILL_AZIMUTH_DEG)).toBe(-Math.sign(SUN_AZIMUTH_DEG));
    expect(Math.sign(FILL_DIRECTION[0])).toBe(-Math.sign(SUN_DIRECTION[0]));
  });

  it("sits lower than the sun, as bounce light does", () => {
    expect(FILL_ELEVATION_DEG).toBeLessThan(SUN_ELEVATION_DEG);
    expect(FILL_ELEVATION_DEG).toBeGreaterThan(0);
  });

  it("is a fraction of the sun's strength, never a second key light", () => {
    const ratio = FILL_INTENSITY / SUN_INTENSITY;
    expect(ratio).toBeGreaterThanOrEqual(0.15);
    expect(ratio).toBeLessThanOrEqual(0.4);
  });

  it("is mounted along its direction at the sun's distance", () => {
    expect(Math.hypot(...FILL_OFFSET)).toBeCloseTo(SUN_DISTANCE, 6);
    FILL_OFFSET.forEach((component, axis) => {
      expect(component).toBeCloseTo(FILL_DIRECTION[axis] * SUN_DISTANCE, 6);
    });
    // Behind the camera on the right, above the target.
    const elevation = (FILL_ELEVATION_DEG * Math.PI) / 180;
    expect(FILL_OFFSET[1]).toBeCloseTo(SUN_DISTANCE * Math.sin(elevation), 6);
    expect(Math.hypot(FILL_OFFSET[0], FILL_OFFSET[2])).toBeCloseTo(SUN_DISTANCE * Math.cos(elevation), 6);
    expect(FILL_OFFSET[0]).toBeGreaterThan(0);
    expect(FILL_OFFSET[2]).toBeGreaterThan(0);
  });
});

describe("the sun's shadow camera", () => {
  const heights = { min: -metresToUnits(SEABED_FLOOR_DEPTH), max: SHADOW_CASTER_HEIGHT };

  it("keeps the whole scene between its near and far planes at every box extent", () => {
    for (const extent of [SHADOW_EXTENT_MIN, (SHADOW_EXTENT_MIN + SHADOW_EXTENT) / 2, SHADOW_EXTENT]) {
      const { near, far } = shadowDepthRange(extent, SUN_DISTANCE, SUN_ELEVATION_DEG, heights);
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

  it("sits at the cap at full zoom-out and well under it at ship zoom", () => {
    const texelMetres = (distance: number) =>
      unitsToMetres(shadowTexel(shadowExtentFor(distance, 16 / 9, SUN_SHADOW.fit), SUN_SHADOW.mapSize));
    expect(shadowExtentFor(CAMERA_MAX_DISTANCE, 16 / 9, SUN_SHADOW.fit)).toBe(SHADOW_EXTENT);
    expect(texelMetres(CAMERA_MAX_DISTANCE)).toBeCloseTo(0.79, 2);
    // CAMERA_MIN_DISTANCE is as close as the zoom allows; 3.5 is the ship-zoom design point.
    expect(shadowExtentFor(CAMERA_MIN_DISTANCE, 16 / 9, SUN_SHADOW.fit)).toBeLessThan(SHADOW_EXTENT * 0.5);
    expect(texelMetres(CAMERA_MIN_DISTANCE)).toBeLessThan(0.38);
    expect(texelMetres(3.5)).toBeLessThan(0.34);
  });

  it("does not ask for the deprecated PCFSoft filter, which three 0.182 replaces with PCF", () => {
    expect(SHADOW_MAP_TYPE).not.toBe(PCFSoftShadowMap);
  });
});
