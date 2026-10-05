import { describe, it, expect } from "vitest";
import {
  gridFadeOpacity,
  gridFadeForCameraDistance,
  GRID_EMPHASIS_COLOR,
  GRID_FADE,
  GRID_FADE_ZOOM_DISTANCE,
  GRID_LINE_COLOR,
} from "./hexOutlineGrid";
import {
  CAMERA_FOV,
  CAMERA_MAX_DISTANCE,
  CAMERA_PITCH,
  MAX_VIEW_ASPECT,
  groundViewReach,
} from "./cameraBounds";

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
    expect(gridFadeForCameraDistance(GRID_FADE, 10)).toEqual(GRID_FADE);
    expect(gridFadeForCameraDistance(GRID_FADE, GRID_FADE_ZOOM_DISTANCE)).toEqual(GRID_FADE);
  });

  it("keeps the base opacity when zoomed out", () => {
    expect(gridFadeForCameraDistance(GRID_FADE, 28).baseOpacity).toBe(GRID_FADE.baseOpacity);
  });

  it("starts the fade past everything on screen at full zoom-out, on the widest supported screen", () => {
    // The whole visible map is gridded: nothing on screen is faded.
    const reach = groundViewReach(CAMERA_MAX_DISTANCE, CAMERA_PITCH, CAMERA_FOV, MAX_VIEW_ASPECT);
    const { fadeStart, fadeEnd } = gridFadeForCameraDistance(GRID_FADE, CAMERA_MAX_DISTANCE);
    expect(fadeStart).toBeGreaterThanOrEqual(reach);
    expect(fadeEnd).toBeGreaterThan(fadeStart);
    // And the full grid still ends somewhere, as on the close-up fade.
    expect(gridFadeOpacity(reach, 0, { fadeStart, fadeEnd, baseOpacity: 1 })).toBe(1);
    expect(gridFadeOpacity(10 * reach, 0, { fadeStart, fadeEnd, baseOpacity: 1 })).toBe(0);
  });

  it("grows continuously and monotonically from the close-up fade to full zoom-out", () => {
    const just = gridFadeForCameraDistance(GRID_FADE, GRID_FADE_ZOOM_DISTANCE + 1e-6);
    expect(just.fadeStart).toBeCloseTo(GRID_FADE.fadeStart, 4);
    expect(just.fadeEnd).toBeCloseTo(GRID_FADE.fadeEnd, 4);
    let prev = GRID_FADE;
    for (let d = GRID_FADE_ZOOM_DISTANCE; d <= 40; d += 0.5) {
      const next = gridFadeForCameraDistance(GRID_FADE, d);
      expect(next.fadeStart).toBeGreaterThanOrEqual(prev.fadeStart);
      expect(next.fadeEnd).toBeGreaterThanOrEqual(prev.fadeEnd);
      // No pop: a half unit of zoom never moves the fade by more than a map's worth.
      expect(next.fadeStart - prev.fadeStart).toBeLessThan(10);
      prev = next;
    }
  });

  it("keeps the fade ring in proportion to the full grid as it grows", () => {
    const ratio = GRID_FADE.fadeEnd / GRID_FADE.fadeStart;
    for (const d of [20, 28]) {
      const { fadeStart, fadeEnd } = gridFadeForCameraDistance(GRID_FADE, d);
      expect(fadeEnd / fadeStart).toBeCloseTo(ratio, 9);
    }
  });
});
