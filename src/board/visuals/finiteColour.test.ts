import { describe, expect, it } from "vitest";
import { finiteColour, HDR_COLOUR_MAX, SUN_GLINT_MAX } from "./finiteColour";

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

  it("caps below a half float's largest value, so the composer's buffers never hold Infinity", () => {
    expect(HDR_COLOUR_MAX).toBeLessThan(65504);
    expect(SUN_GLINT_MAX).toBeLessThanOrEqual(HDR_COLOUR_MAX);
  });

  it("leaves the glint bright enough to bloom (the threshold is under 1)", () => {
    expect(SUN_GLINT_MAX).toBeGreaterThan(8);
  });
});
