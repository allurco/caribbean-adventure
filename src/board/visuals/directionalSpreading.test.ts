import { describe, expect, it } from "vitest";
import { directionalSpreading, spreadingExponent } from "./directionalSpreading";

const sea = { windSpeed: 10, fetch: 100_000, peakEnhancement: 3.3 };
const wp = 1.0083; // JONSWAP peak for this sea, rad/s

const integrateAngle = (f: (theta: number) => number, n = 4000) => {
  const h = (2 * Math.PI) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += f(-Math.PI + (i + 0.5) * h);
  return sum * h;
};

describe("Mitsuyasu spreading exponent", () => {
  it("is 11.5 (ωp U / g)^−2.5 at the peak: ≈ 10.7 for 10 m/s over 100 km", () => {
    expect(spreadingExponent(wp, sea)).toBeCloseTo(10.7, 1);
  });

  it("broadens away from the peak on both sides", () => {
    const sp = spreadingExponent(wp, sea);
    expect(spreadingExponent(0.7 * wp, sea)).toBeLessThan(sp);
    expect(spreadingExponent(3 * wp, sea)).toBeLessThan(sp);
  });
});

describe("directionalSpreading", () => {
  it("integrates to 1 over all directions, at every frequency", () => {
    for (const w of [0.5 * wp, wp, 2 * wp, 5 * wp]) {
      const total = integrateAngle((t) => directionalSpreading(t, w, sea));
      expect(total).toBeCloseTo(1, 4);
    }
  });

  it("is largest down-wind and symmetric about it", () => {
    const down = directionalSpreading(0, wp, sea);
    expect(directionalSpreading(0.3, wp, sea)).toBeLessThan(down);
    expect(directionalSpreading(0.3, wp, sea)).toBeCloseTo(directionalSpreading(-0.3, wp, sea), 12);
  });

  it("puts almost nothing up-wind at the peak", () => {
    expect(directionalSpreading(Math.PI, wp, sea)).toBeLessThan(1e-6);
  });
});
