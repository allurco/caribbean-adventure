import { describe, expect, it } from "vitest";
import { TRADE_WIND, windFor } from "./wind";

describe("windFor", () => {
  it("is pure: the same weather gives deep-equal winds, as fresh objects", () => {
    const a = windFor(TRADE_WIND);
    windFor({ angle: 1, speed: 2 });
    const b = windFor(TRADE_WIND);
    expect(b).toEqual(a);
    expect(b).not.toBe(a);
  });

  it("blows the trade wind toward screen top-left on the board, at 7 m/s", () => {
    const wind = windFor(TRADE_WIND);
    // 115° round from +x past −z: up the screen (−z) and to the left (−x).
    expect(wind.angle).toBeCloseTo((-115 * Math.PI) / 180, 12);
    expect(wind.toward[0]).toBeLessThan(0);
    expect(wind.toward[1]).toBeLessThan(0);
    expect(wind.speed).toBe(7);
  });

  it("points `toward` along its angle, at unit length", () => {
    for (const angle of [-3, -2, 0, 1, 2.5]) {
      const wind = windFor({ ...TRADE_WIND, angle });
      expect(Math.hypot(...wind.toward)).toBeCloseTo(1, 12);
      expect(wind.toward[0]).toBeCloseTo(Math.cos(angle), 12);
      expect(wind.toward[1]).toBeCloseTo(Math.sin(angle), 12);
    }
  });

  it("turns with its angle and strengthens with its speed", () => {
    expect(windFor({ angle: 0, speed: 7 }).toward).toEqual([1, 0]);
    expect(windFor({ ...TRADE_WIND, speed: 12 }).speed).toBe(12);
  });
});
