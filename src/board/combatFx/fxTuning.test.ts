import { describe, expect, it } from "vitest";
import { FX_ZOOM, SHOT_IRON, SPARKS, fxScaleForDistance, shotGlintPeak } from "./fxTuning";
import { SCENE_LIGHTING } from "../visuals/sceneLighting";

describe("the fight's small effects grow as the camera zooms out (#263)", () => {
  it("true size up close", () => {
    expect(fxScaleForDistance(0.5)).toBe(1);
    expect(fxScaleForDistance(FX_ZOOM.nearDistance)).toBe(1);
  });

  it("grows smoothly with the distance, to a cap at the overview zoom", () => {
    const at = [3, 5, 8, 12, 18].map(fxScaleForDistance);
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThanOrEqual(at[i - 1]);
    expect(fxScaleForDistance(FX_ZOOM.farDistance)).toBeCloseTo(FX_ZOOM.maxScale, 9);
    expect(fxScaleForDistance(1000)).toBe(FX_ZOOM.maxScale);
    // No jump where the curve starts or ends.
    expect(fxScaleForDistance(FX_ZOOM.nearDistance + 0.01) - 1).toBeLessThan(0.01);
  });
});

describe("tuning", () => {
  it("the muzzle's burst is bigger than a hit's shower", () => {
    expect(SPARKS.muzzle.count).toBeGreaterThan(SPARKS.hit.count);
    expect(SPARKS.muzzle.speed).toBeGreaterThan(SPARKS.hit.speed);
    expect(SPARKS.muzzle.reducedCount).toBeLessThan(SPARKS.muzzle.count);
  });

  it("the round shot's sun glint is a small dim point, under the bloom's threshold", () => {
    const sun = SCENE_LIGHTING.sun.intensity;
    expect(shotGlintPeak(SHOT_IRON, sun)).toBeGreaterThan(0.05); // it does glint
    expect(shotGlintPeak(SHOT_IRON, sun)).toBeLessThan(SCENE_LIGHTING.bloom.threshold);
  });
});
