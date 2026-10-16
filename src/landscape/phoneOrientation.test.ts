import { describe, expect, it } from "vitest";
import { isPhone, isPortraitPhone, type ViewportSample } from "./phoneOrientation";

/** A device whose screen is `screen` (as `screen.width`, `screen.height`) showing the page in a window of `window`. */
function device(screen: [number, number], window: [number, number], coarse = true): ViewportSample {
  return { screenWidth: screen[0], screenHeight: screen[1], width: window[0], height: window[1], coarse };
}

const IPHONE_15: [number, number] = [393, 852];
const IPAD_AIR: [number, number] = [820, 1180];
const IPAD_MINI: [number, number] = [744, 1133];

describe("isPortraitPhone", () => {
  it("is true for a touch phone held upright", () => {
    expect(isPortraitPhone(device([390, 844], [390, 844]))).toBe(true);
    expect(isPortraitPhone(device([375, 667], [375, 667]))).toBe(true);
    expect(isPortraitPhone(device([430, 932], [430, 932]))).toBe(true);
  });

  it("is false for the same phone turned sideways", () => {
    expect(isPortraitPhone(device([844, 390], [844, 390]))).toBe(false);
    // iOS reports the screen as if upright whichever way the phone is held
    expect(isPortraitPhone(device(IPHONE_15, [852, 393]))).toBe(false);
  });

  it("is false for a mouse-driven window, however narrow", () => {
    expect(isPortraitPhone(device([1440, 900], [390, 844], false))).toBe(false);
    expect(isPortraitPhone(device([390, 844], [390, 844], false))).toBe(false);
  });

  it("is false for tablets held either way", () => {
    expect(isPortraitPhone(device([768, 1024], [768, 1024]))).toBe(false);
    expect(isPortraitPhone(device(IPAD_MINI, IPAD_MINI))).toBe(false);
    expect(isPortraitPhone(device(IPAD_AIR, [1180, 820]))).toBe(false);
  });

  it("is false for an iPad in 1/3 Split View: a narrow, tall window on a tablet's screen", () => {
    expect(isPortraitPhone(device(IPAD_AIR, [320, 1180]))).toBe(false);
    expect(isPortraitPhone(device(IPAD_AIR, [375, 820]))).toBe(false);
  });

  it("is false for an iPad app in Slide Over", () => {
    expect(isPortraitPhone(device([1024, 1366], [375, 1024]))).toBe(false);
  });

  it("is false for an Android tablet in multi-window", () => {
    expect(isPortraitPhone(device([800, 1280], [400, 1280]))).toBe(false);
  });

  it("is false for an unfolded Fold, whose inner screen is tablet-sized", () => {
    expect(isPortraitPhone(device([673, 841], [673, 841]))).toBe(false);
  });

  it("is true for a Fold's cover screen, folded shut: a phone", () => {
    expect(isPortraitPhone(device([344, 882], [344, 882]))).toBe(true);
  });

  it("is false for a desktop with a touchscreen, whatever its window", () => {
    expect(isPortraitPhone(device([1920, 1080], [400, 1000]))).toBe(false);
  });

  it("draws the phone's edge at a screen short side of 540 px", () => {
    expect(isPortraitPhone(device([540, 960], [540, 960]))).toBe(true);
    expect(isPortraitPhone(device([541, 960], [541, 960]))).toBe(false);
  });

  it("counts a square window as portrait, as the CSS orientation query does", () => {
    expect(isPortraitPhone(device([400, 800], [400, 400]))).toBe(true);
  });
});

describe("isPhone", () => {
  it("goes by the screen, not the window", () => {
    expect(isPhone(device([390, 844], [844, 390]))).toBe(true);
    expect(isPhone(device(IPAD_AIR, [320, 1180]))).toBe(false);
  });
});
