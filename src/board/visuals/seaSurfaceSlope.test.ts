import { describe, expect, it } from "vitest";
import { coxMunkSlopeVariance, unresolvedSlopeVariance } from "./seaSurfaceSlope";

describe("coxMunkSlopeVariance", () => {
  it("is 0.003 + 5.12e-3 U for a clean sea: 0.0542 at 10 m/s", () => {
    expect(coxMunkSlopeVariance(10)).toBeCloseTo(0.0542, 6);
  });

  it("is 0.003 in calm air", () => {
    expect(coxMunkSlopeVariance(0)).toBeCloseTo(0.003, 6);
  });
});

describe("unresolvedSlopeVariance", () => {
  it("is what the measured total leaves after the resolved waves", () => {
    expect(unresolvedSlopeVariance(10, 0.02)).toBeCloseTo(0.0342, 6);
  });

  it("never goes negative when the waves resolve more than the measurement", () => {
    expect(unresolvedSlopeVariance(1, 0.5)).toBe(0);
  });
});
