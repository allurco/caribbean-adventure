import { describe, expect, it } from "vitest";
import {
  GRAVITY,
  deepWaterFrequency,
  deepWaterFrequencySlope,
  wavePeriodMultiple,
} from "./waveDispersion";

describe("deep-water dispersion", () => {
  it("gives a 100 m wave a period of about 8 s", () => {
    // Textbook: T = sqrt(2π·λ / g) = 8.0 s for λ = 100 m.
    const k = (2 * Math.PI) / 100;
    expect((2 * Math.PI) / deepWaterFrequency(k)).toBeCloseTo(8.0, 1);
  });

  it("uses standard gravity", () => {
    expect(GRAVITY).toBeCloseTo(9.81, 2);
  });

  it("has a group velocity half the phase velocity", () => {
    const k = 0.3;
    const phase = deepWaterFrequency(k) / k;
    expect(deepWaterFrequencySlope(k)).toBeCloseTo(phase / 2, 10);
  });

  it("is still at k = 0", () => {
    expect(deepWaterFrequency(0)).toBe(0);
  });
});

describe("wavePeriodMultiple", () => {
  const loop = 200;

  it("rounds each frequency to a whole number of cycles per loop", () => {
    // ω = 1.1 rad/s over 200 s is 35.01 cycles.
    const k = (1.1 * 1.1) / GRAVITY;
    expect(wavePeriodMultiple(k, loop)).toBe(35);
  });

  it("stays within half a cycle per loop of the true frequency", () => {
    for (const k of [0.01, 0.05, 0.2, 1, 3]) {
      const exact = (deepWaterFrequency(k) * loop) / (2 * Math.PI);
      expect(Math.abs(wavePeriodMultiple(k, loop) - exact)).toBeLessThanOrEqual(0.5);
    }
  });
});
