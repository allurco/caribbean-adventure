import { describe, it, expect } from "vitest";
import {
  advanceSurfTime,
  surfTimeRate,
  SURF_LOOP_SECONDS,
  SURF_PULSE_PERIOD,
  SURF_CHURN_PERIOD,
  SURF_MAX_FRAME_STEP,
  SURF_REDUCED_MOTION_RATE,
  SURF_TIMING_GLSL,
} from "./surfMotion";

describe("surfMotion", () => {
  describe("loop length", () => {
    it("is a whole number of every surf period, so wrapping it is seamless", () => {
      for (const period of [SURF_PULSE_PERIOD, SURF_CHURN_PERIOD]) {
        const cycles = SURF_LOOP_SECONDS / period;
        expect(Number.isInteger(cycles)).toBe(true);
        expect(cycles).toBeGreaterThanOrEqual(1);
      }
    });

    it("stays small enough for float32 phase math in the shader", () => {
      // 2π · loop / shortest period must stay a modest angle (well under 1e3 rad).
      expect((2 * Math.PI * SURF_LOOP_SECONDS) / Math.min(SURF_PULSE_PERIOD, SURF_CHURN_PERIOD)).toBeLessThan(1000);
    });

    it("pulses on a slow cycle", () => {
      expect(SURF_PULSE_PERIOD).toBeGreaterThanOrEqual(4);
    });
  });

  describe("surfTimeRate", () => {
    it("runs at real time normally", () => {
      expect(surfTimeRate(false)).toBe(1);
    });

    it("freezes or strongly slows with reduced motion", () => {
      expect(surfTimeRate(true)).toBe(SURF_REDUCED_MOTION_RATE);
      expect(SURF_REDUCED_MOTION_RATE).toBeGreaterThanOrEqual(0);
      expect(SURF_REDUCED_MOTION_RATE).toBeLessThanOrEqual(0.1);
    });
  });

  describe("advanceSurfTime", () => {
    it("advances by the frame delta", () => {
      expect(advanceSurfTime(3, 0.016, false)).toBeCloseTo(3.016, 9);
    });

    it("wraps into [0, SURF_LOOP_SECONDS)", () => {
      const t = advanceSurfTime(SURF_LOOP_SECONDS - 0.01, 0.03, false);
      expect(t).toBeCloseTo(0.02, 9);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(SURF_LOOP_SECONDS);
    });

    it("never grows unbounded over a long session", () => {
      let t = 0;
      for (let i = 0; i < 60 * 60 * 2; i++) t = advanceSurfTime(t, 1 / 60, false);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(SURF_LOOP_SECONDS);
    });

    it("applies the reduced-motion rate without jumping", () => {
      expect(advanceSurfTime(5, 0.05, true)).toBeCloseTo(5 + 0.05 * SURF_REDUCED_MOTION_RATE, 9);
    });

    it("caps a long frame (tab was hidden) so the surf doesn't lurch", () => {
      expect(advanceSurfTime(1, 30, false)).toBeCloseTo(1 + SURF_MAX_FRAME_STEP, 9);
    });

    it("ignores negative or non-finite deltas", () => {
      expect(advanceSurfTime(2, -1, false)).toBe(2);
      expect(advanceSurfTime(2, Number.NaN, false)).toBe(2);
    });
  });

  it("exposes the periods to GLSL as float constants", () => {
    expect(SURF_TIMING_GLSL).toContain(`const float SURF_PULSE_PERIOD = ${SURF_PULSE_PERIOD.toFixed(1)};`);
    expect(SURF_TIMING_GLSL).toContain(`const float SURF_CHURN_PERIOD = ${SURF_CHURN_PERIOD.toFixed(1)};`);
  });
});
