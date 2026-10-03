import { describe, it, expect } from "vitest";
import {
  gridFadeOpacity,
  gridFadeForCameraDistance,
  GRID_EMPHASIS_COLOR,
  GRID_FADE,
  GRID_FADE_ZOOM_DISTANCE,
  GRID_LINE_COLOR,
} from "./hexOutlineGrid";

describe("gridFadeOpacity", () => {
  const params = { fadeStart: 4, fadeEnd: 10, baseOpacity: 0.15 };

  it("uses the base opacity near the focus point", () => {
    expect(gridFadeOpacity(0, 0, params)).toBeCloseTo(0.15);
    expect(gridFadeOpacity(4, 0, params)).toBeCloseTo(0.15);
  });

  it("disappears beyond the fade end", () => {
    expect(gridFadeOpacity(10, 0, params)).toBe(0);
    expect(gridFadeOpacity(50, 0, params)).toBe(0);
  });

  it("fades monotonically between start and end", () => {
    const a = gridFadeOpacity(5, 0, params);
    const b = gridFadeOpacity(7, 0, params);
    const c = gridFadeOpacity(9, 0, params);
    expect(a).toBeLessThan(0.15);
    expect(b).toBeLessThan(a);
    expect(c).toBeLessThan(b);
    expect(c).toBeGreaterThan(0);
  });

  it("never drops below the emphasis opacity of an acted-on hex", () => {
    expect(gridFadeOpacity(50, 0.6, params)).toBeCloseTo(0.6);
    expect(gridFadeOpacity(0, 0.6, params)).toBeCloseTo(0.6);
  });

  it("scales the base opacity by the shore fade", () => {
    expect(gridFadeOpacity(0, 0, params, 1)).toBeCloseTo(0.15);
    expect(gridFadeOpacity(0, 0, params, 0.5)).toBeCloseTo(0.075);
    expect(gridFadeOpacity(0, 0, params, 0)).toBe(0);
  });

  it("keeps acted-on hexes visible at the shore", () => {
    expect(gridFadeOpacity(0, 0.45, params, 0)).toBeCloseTo(0.45);
  });
});

describe("grid line colours", () => {
  it("uses a sea tint, not stark white, for the calm grid", () => {
    expect(GRID_LINE_COLOR.toLowerCase()).not.toBe("#ffffff");
  });

  it("brightens emphasised lines toward a distinct colour", () => {
    expect(GRID_EMPHASIS_COLOR.toLowerCase()).not.toBe(GRID_LINE_COLOR.toLowerCase());
  });
});

describe("gridFadeForCameraDistance", () => {
  it("is unchanged at close zoom", () => {
    expect(gridFadeForCameraDistance(GRID_FADE, 4)).toEqual(GRID_FADE);
    expect(gridFadeForCameraDistance(GRID_FADE, GRID_FADE_ZOOM_DISTANCE)).toEqual(GRID_FADE);
  });

  it("widens the fade in proportion to the distance when zoomed out", () => {
    const wide = gridFadeForCameraDistance(GRID_FADE, GRID_FADE_ZOOM_DISTANCE * 2);
    expect(wide.fadeStart).toBeCloseTo(GRID_FADE.fadeStart * 2);
    expect(wide.fadeEnd).toBeCloseTo(GRID_FADE.fadeEnd * 2);
    expect(wide.baseOpacity).toBe(GRID_FADE.baseOpacity);
  });

  it("grows continuously and monotonically with distance", () => {
    const just = gridFadeForCameraDistance(GRID_FADE, GRID_FADE_ZOOM_DISTANCE + 1e-6);
    expect(just.fadeEnd).toBeCloseTo(GRID_FADE.fadeEnd);
    let prev = GRID_FADE.fadeEnd;
    for (let d = GRID_FADE_ZOOM_DISTANCE; d <= 40; d += 2) {
      const { fadeEnd } = gridFadeForCameraDistance(GRID_FADE, d);
      expect(fadeEnd).toBeGreaterThanOrEqual(prev);
      prev = fadeEnd;
    }
  });

  it("covers a visibly larger area at full zoom-out", () => {
    const zoomedOut = gridFadeForCameraDistance(GRID_FADE, 28);
    expect(zoomedOut.fadeEnd).toBeGreaterThan(GRID_FADE.fadeEnd * 1.5);
  });
});
