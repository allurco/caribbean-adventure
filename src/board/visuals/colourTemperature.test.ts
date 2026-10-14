import { describe, expect, it } from "vitest";
import { kelvinToHex, kelvinToRgb } from "./colourTemperature";

describe("kelvinToRgb", () => {
  it("is near white at daylight (6600 K)", () => {
    const [r, g, b] = kelvinToRgb(6600);
    expect(r).toBe(255);
    expect(g).toBeGreaterThan(245);
    expect(b).toBe(255);
  });

  it("warms as the temperature falls: blue drops faster than green", () => {
    const [, g5, b5] = kelvinToRgb(5000);
    const [, g3, b3] = kelvinToRgb(3200);
    expect(g3).toBeLessThan(g5);
    expect(b3).toBeLessThan(b5);
    expect(b5 - b3).toBeGreaterThan(g5 - g3);
  });

  it("puts a 3200 K lamp near the published (255, 184, 123)", () => {
    const [r, g, b] = kelvinToRgb(3200);
    expect(r).toBe(255);
    expect(Math.abs(g - 184)).toBeLessThanOrEqual(3);
    expect(Math.abs(b - 123)).toBeLessThanOrEqual(3);
  });
});

describe("kelvinToHex", () => {
  it("formats the bytes as #rrggbb", () => {
    expect(kelvinToHex(3200)).toMatch(/^#ffb[0-9a-f]7[0-9a-f]$/);
    expect(kelvinToHex(1000)).toMatch(/^#ff[0-9a-f]{2}00$/);
  });
});
