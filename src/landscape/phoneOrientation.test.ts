import { describe, expect, it } from "vitest";
import { isPortraitPhone } from "./phoneOrientation";

describe("isPortraitPhone", () => {
  it("is true for a touch phone held upright", () => {
    expect(isPortraitPhone({ width: 390, height: 844, coarse: true })).toBe(true);
    expect(isPortraitPhone({ width: 375, height: 667, coarse: true })).toBe(true);
    expect(isPortraitPhone({ width: 430, height: 932, coarse: true })).toBe(true);
  });

  it("is false for the same phone turned sideways", () => {
    expect(isPortraitPhone({ width: 844, height: 390, coarse: true })).toBe(false);
    expect(isPortraitPhone({ width: 667, height: 375, coarse: true })).toBe(false);
  });

  it("is false for a mouse-driven window, however narrow", () => {
    expect(isPortraitPhone({ width: 390, height: 844, coarse: false })).toBe(false);
    expect(isPortraitPhone({ width: 320, height: 900, coarse: false })).toBe(false);
  });

  it("is false for tablets held either way", () => {
    expect(isPortraitPhone({ width: 768, height: 1024, coarse: true })).toBe(false);
    expect(isPortraitPhone({ width: 744, height: 1133, coarse: true })).toBe(false);
    expect(isPortraitPhone({ width: 1180, height: 820, coarse: true })).toBe(false);
  });

  it("draws the phone's edge at a short side of 540 px", () => {
    expect(isPortraitPhone({ width: 540, height: 960, coarse: true })).toBe(true);
    expect(isPortraitPhone({ width: 541, height: 960, coarse: true })).toBe(false);
  });

  it("counts a square touch screen as portrait, as the CSS orientation query does", () => {
    expect(isPortraitPhone({ width: 400, height: 400, coarse: true })).toBe(true);
  });
});
