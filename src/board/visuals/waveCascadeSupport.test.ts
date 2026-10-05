import { describe, it, expect } from "vitest";
import { cascadeTargetTypes } from "./waveCascadeSupport";

describe("cascadeTargetTypes", () => {
  it("works in full float when the GPU renders to float (EXT_color_buffer_float also covers half float)", () => {
    expect(cascadeTargetTypes({ colorBufferFloat: true, colorBufferHalfFloat: false })).toEqual({
      work: "float",
      output: "half",
    });
  });

  it("falls back to half float when only half float is renderable", () => {
    expect(cascadeTargetTypes({ colorBufferFloat: false, colorBufferHalfFloat: true })).toEqual({
      work: "half",
      output: "half",
    });
  });

  it("returns null when neither is renderable, so the cascade is skipped instead of drawing into incomplete targets", () => {
    expect(cascadeTargetTypes({ colorBufferFloat: false, colorBufferHalfFloat: false })).toBeNull();
  });
});
