import { describe, it, expect } from "vitest";
import { seabedDepth } from "./seabedProfile";

/** One hex, centre to centre, in metres at the render scale (√3 units × 65 m). */
const HEX_METRES = Math.sqrt(3) * 65;

describe("seabedDepth (metres below sea level by distance offshore, metres)", () => {
  it("is exactly 0 at the waterline", () => {
    expect(seabedDepth(0)).toBe(0);
  });

  it("starts with a gentle sand beach face: between 1:20 and 1:100 over the first 10 m", () => {
    expect(seabedDepth(10)).toBeGreaterThan(0.1);
    expect(seabedDepth(10)).toBeLessThan(0.5);
  });

  it("is a 2–15 m shelf from about 50 m out to a full hex offshore", () => {
    for (let s = 50; s <= HEX_METRES; s += 5) {
      expect(seabedDepth(s)).toBeGreaterThanOrEqual(2);
      expect(seabedDepth(s)).toBeLessThanOrEqual(15);
    }
  });

  it("drops off to deep water (≥ 65 m) within two hexes", () => {
    expect(seabedDepth(2 * HEX_METRES)).toBeGreaterThanOrEqual(65);
  });

  it("reaches 100 m (below the visible-seabed cut-off) within 230 m", () => {
    expect(seabedDepth(230)).toBeGreaterThanOrEqual(100);
  });

  it("levels out to a deep floor and never exceeds it", () => {
    expect(seabedDepth(1000)).toBeGreaterThan(110);
    expect(seabedDepth(1e6)).toBeLessThan(130);
  });

  it("always gets deeper going offshore, with no flat terraces", () => {
    let prev = seabedDepth(0);
    for (let s = 0.5; s <= 300; s += 0.5) {
      const d = seabedDepth(s);
      // Slope stays above 1:100 everywhere out to the floor.
      expect(d - prev).toBeGreaterThan(0.005);
      prev = d;
    }
  });

  it("is smooth: the slope changes gradually (no kinks)", () => {
    const step = 0.5;
    let prevSlope = (seabedDepth(step) - seabedDepth(0)) / step;
    for (let s = step; s <= 400; s += step) {
      const slope = (seabedDepth(s + step) - seabedDepth(s)) / step;
      expect(Math.abs(slope - prevSlope)).toBeLessThan(0.05);
      prevSlope = slope;
    }
  });

  it("treats negative distance (on land) as the waterline", () => {
    expect(seabedDepth(-5)).toBe(0);
  });
});
