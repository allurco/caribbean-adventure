import { describe, expect, it } from "vitest";
import { jonswapPeakFrequency, jonswapSpectrum, jonswapAlpha } from "./jonswap";

// Hasselmann et al. (1973) worked example: 10 m/s wind over a 100 km fetch.
const sea = { windSpeed: 10, fetch: 100_000, peakEnhancement: 3.3 };

const integrate = (f: (w: number) => number, a: number, b: number, n = 20000) => {
  const h = (b - a) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += f(a + (i + 0.5) * h);
  return sum * h;
};

describe("JONSWAP spectrum", () => {
  it("peaks near 0.165 Hz for 10 m/s over 100 km", () => {
    // fp = 3.5 (g/U) (gF/U²)^−0.33 = 0.1655 Hz.
    expect(jonswapPeakFrequency(sea) / (2 * Math.PI)).toBeCloseTo(0.165, 2);
  });

  it("has the Phillips constant of the fetch law (≈ 0.0101 here)", () => {
    expect(jonswapAlpha(sea)).toBeCloseTo(0.0101, 4);
  });

  it("has its maximum at the peak frequency", () => {
    const wp = jonswapPeakFrequency(sea);
    let best = 0;
    let bestW = 0;
    for (let w = 0.2; w < 4; w += 0.0005) {
      const s = jonswapSpectrum(w, sea);
      if (s > best) {
        best = s;
        bestW = w;
      }
    }
    expect(bestW / wp).toBeCloseTo(1, 2);
  });

  it("is γ times the Pierson–Moskowitz shape at the peak and close to it well away", () => {
    const wp = jonswapPeakFrequency(sea);
    const pm = { ...sea, peakEnhancement: 1 };
    expect(jonswapSpectrum(wp, sea) / jonswapSpectrum(wp, pm)).toBeCloseTo(3.3, 6);
    expect(jonswapSpectrum(2 * wp, sea) / jonswapSpectrum(2 * wp, pm)).toBeCloseTo(1, 3);
  });

  it("holds the Pierson–Moskowitz energy αg² / (5 ωp⁴) when γ = 1", () => {
    // Substituting u = (ωp/ω)⁴ gives ∫ αg²ω⁻⁵ e^(−5u/4) dω = αg² / (5 ωp⁴) exactly.
    // For 10 m/s over 100 km: 0.0101 · 9.81² / (5 · 1.0083⁴) ≈ 0.188 m².
    const pm = { ...sea, peakEnhancement: 1 };
    const m0 = integrate((w) => jonswapSpectrum(w, pm), 0.05, 40, 80000);
    expect(m0).toBeCloseTo(0.188, 2);
  });

  it("adds energy around the peak with γ = 3.3: Hs ≈ 2.1 m for 10 m/s over 100 km", () => {
    // Hs = 4√m0. The γ = 3.3 spectrum carries about 1.5× the PM energy; the
    // shorter fetch-law fits (e.g. Carter 1982, 1.6 m) are lower, since
    // Hasselmann's α, ωp and γ fits are not mutually exact.
    const m0 = integrate((w) => jonswapSpectrum(w, sea), 0.05, 40, 80000);
    expect(4 * Math.sqrt(m0)).toBeGreaterThan(1.9);
    expect(4 * Math.sqrt(m0)).toBeLessThan(2.3);
  });

  it("is zero at and below zero frequency", () => {
    expect(jonswapSpectrum(0, sea)).toBe(0);
    expect(jonswapSpectrum(-1, sea)).toBe(0);
  });
});
