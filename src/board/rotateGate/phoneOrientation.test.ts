import { describe, expect, it } from "vitest";
import { isLandscapePhone, isPortraitPhone, phoneOrientation } from "./phoneOrientation";

describe("phoneOrientation", () => {
  it("reads a touch phone held upright as portrait", () => {
    expect(phoneOrientation({ width: 390, height: 844, coarse: true })).toBe("portrait");
    expect(isPortraitPhone({ width: 375, height: 667, coarse: true })).toBe(true);
    expect(isPortraitPhone({ width: 430, height: 932, coarse: true })).toBe(true);
  });

  it("reads the same phone turned sideways as landscape", () => {
    expect(phoneOrientation({ width: 844, height: 390, coarse: true })).toBe("landscape");
    expect(isLandscapePhone({ width: 932, height: 430, coarse: true })).toBe(true);
    expect(isLandscapePhone({ width: 667, height: 375, coarse: true })).toBe(true);
    expect(isPortraitPhone({ width: 844, height: 390, coarse: true })).toBe(false);
  });

  it("never treats a mouse-driven window as a phone, however narrow", () => {
    expect(phoneOrientation({ width: 500, height: 900, coarse: false })).toBeNull();
    expect(phoneOrientation({ width: 1440, height: 900, coarse: false })).toBeNull();
    expect(isPortraitPhone({ width: 390, height: 844, coarse: false })).toBe(false);
  });

  it("leaves tablets alone in either orientation", () => {
    expect(phoneOrientation({ width: 768, height: 1024, coarse: true })).toBeNull();
    expect(phoneOrientation({ width: 1180, height: 820, coarse: true })).toBeNull();
    expect(phoneOrientation({ width: 744, height: 1133, coarse: true })).toBeNull();
  });

  it("counts a square touch screen as portrait, matching the CSS orientation query", () => {
    expect(phoneOrientation({ width: 400, height: 400, coarse: true })).toBe("portrait");
  });
});
