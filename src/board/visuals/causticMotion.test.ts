import { describe, it, expect } from "vitest";
import {
  advanceCausticTime,
  causticTimeRate,
  CAUSTIC_LOOP_SECONDS,
  CAUSTIC_PERIOD_A,
  CAUSTIC_PERIOD_B,
  CAUSTIC_MAX_FRAME_STEP,
  CAUSTIC_REDUCED_MOTION_RATE,
  CAUSTIC_TIMING_GLSL,
} from "./causticMotion";

describe("causticMotion", () => {
  describe("loop length", () => {
    it("is a whole number of both caustic periods, so wrapping it is seamless", () => {
      for (const period of [CAUSTIC_PERIOD_A, CAUSTIC_PERIOD_B]) {
        const cycles = CAUSTIC_LOOP_SECONDS / period;
        expect(Number.isInteger(cycles)).toBe(true);
        expect(cycles).toBeGreaterThanOrEqual(1);
      }
    });

    it("uses two different periods, so the two layers drift out of step", () => {
      expect(CAUSTIC_PERIOD_A).not.toBe(CAUSTIC_PERIOD_B);
    });

    it("stays small enough for float32 phase math in the shader", () => {
      expect((2 * Math.PI * CAUSTIC_LOOP_SECONDS) / Math.min(CAUSTIC_PERIOD_A, CAUSTIC_PERIOD_B)).toBeLessThan(1000);
    });
  });

  describe("causticTimeRate", () => {
    it("runs at real time normally", () => {
      expect(causticTimeRate(false)).toBe(1);
    });

    it("freezes or strongly slows with reduced motion", () => {
      expect(causticTimeRate(true)).toBe(CAUSTIC_REDUCED_MOTION_RATE);
      expect(CAUSTIC_REDUCED_MOTION_RATE).toBeGreaterThanOrEqual(0);
      expect(CAUSTIC_REDUCED_MOTION_RATE).toBeLessThanOrEqual(0.1);
    });
  });

  describe("advanceCausticTime", () => {
    it("advances by the frame delta", () => {
      expect(advanceCausticTime(3, 0.016, false)).toBeCloseTo(3.016, 9);
    });

    it("wraps into [0, CAUSTIC_LOOP_SECONDS)", () => {
      const t = advanceCausticTime(CAUSTIC_LOOP_SECONDS - 0.01, 0.03, false);
      expect(t).toBeCloseTo(0.02, 9);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(CAUSTIC_LOOP_SECONDS);
    });

    it("gives the same shader phase on both sides of the wrap", () => {
      const before = CAUSTIC_LOOP_SECONDS - 0.01;
      const after = advanceCausticTime(before, 0.01, false);
      for (const period of [CAUSTIC_PERIOD_A, CAUSTIC_PERIOD_B]) {
        const phase = (t: number) => (2 * Math.PI * t) / period;
        expect(Math.cos(phase(after))).toBeCloseTo(Math.cos(phase(before + 0.01)), 6);
        expect(Math.sin(phase(after))).toBeCloseTo(Math.sin(phase(before + 0.01)), 6);
      }
    });

    it("never grows unbounded over a long session", () => {
      let t = 0;
      for (let i = 0; i < 60 * 60 * 2; i++) t = advanceCausticTime(t, 1 / 60, false);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(CAUSTIC_LOOP_SECONDS);
    });

    it("applies the reduced-motion rate without jumping", () => {
      expect(advanceCausticTime(5, 0.05, true)).toBeCloseTo(5 + 0.05 * CAUSTIC_REDUCED_MOTION_RATE, 9);
    });

    it("caps a long frame (tab was hidden) so the caustics don't lurch", () => {
      expect(advanceCausticTime(1, 30, false)).toBeCloseTo(1 + CAUSTIC_MAX_FRAME_STEP, 9);
    });

    it("ignores negative or non-finite deltas", () => {
      expect(advanceCausticTime(2, -1, false)).toBe(2);
      expect(advanceCausticTime(2, Number.NaN, false)).toBe(2);
    });
  });

  it("exposes the periods to GLSL as float constants", () => {
    expect(CAUSTIC_TIMING_GLSL).toContain(`const float CAUSTIC_PERIOD_A = ${CAUSTIC_PERIOD_A.toFixed(1)};`);
    expect(CAUSTIC_TIMING_GLSL).toContain(`const float CAUSTIC_PERIOD_B = ${CAUSTIC_PERIOD_B.toFixed(1)};`);
  });
});
