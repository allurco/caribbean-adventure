import { describe, it, expect } from "vitest";
import { fromLogScale, toLogScale } from "./logScale";

describe("log scale", () => {
  it("maps 0 and 1 to the ends", () => {
    expect(fromLogScale(0, 0.8, 28)).toBeCloseTo(0.8, 12);
    expect(fromLogScale(1, 0.8, 28)).toBeCloseTo(28, 12);
  });

  it("maps the middle to the geometric mean", () => {
    expect(fromLogScale(0.5, 1, 16)).toBeCloseTo(4, 12);
  });

  it("round-trips", () => {
    for (const v of [0.8, 2, 4.32, 16, 28]) expect(fromLogScale(toLogScale(v, 0.8, 28), 0.8, 28)).toBeCloseTo(v, 9);
  });

  it("clamps out-of-range positions and values", () => {
    expect(fromLogScale(-1, 1, 16)).toBeCloseTo(1, 12);
    expect(fromLogScale(2, 1, 16)).toBeCloseTo(16, 12);
    expect(toLogScale(0.1, 1, 16)).toBe(0);
    expect(toLogScale(100, 1, 16)).toBe(1);
  });
});
