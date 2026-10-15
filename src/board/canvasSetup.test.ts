import { describe, expect, it } from "vitest";
import { canvasSetup, CANVAS_DPR } from "./canvasSetup";

describe("canvasSetup: the canvas and composer the A/B switches ask for", () => {
  it("is the game's usual set-up with no switch", () => {
    expect(canvasSetup({}, {})).toEqual({
      dpr: CANVAS_DPR,
      gl: { antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false },
      shadows: true,
      composerMultisampling: 8,
    });
  });

  it("caps the canvas's pixel ratio at 1.5 at most", () => {
    expect(CANVAS_DPR).toEqual([1, 1.5]);
  });

  it("forces DPR 1, a low-power GPU and a preserved drawing buffer when asked", () => {
    const setup = canvasSetup({ dpr1: true, lowPower: true, preserveDrawingBuffer: true }, {});
    expect(setup.dpr).toBe(1);
    expect(setup.gl).toEqual({ antialias: true, powerPreference: "low-power", preserveDrawingBuffer: true });
  });

  it("drops multisampling on the canvas and in the composer, and the shadow maps", () => {
    const setup = canvasSetup({}, { msaa: true, shadows: true });
    expect(setup.gl.antialias).toBe(false);
    expect(setup.composerMultisampling).toBe(0);
    expect(setup.shadows).toBe(false);
  });
});
