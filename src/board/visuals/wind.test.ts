import { describe, expect, it } from "vitest";
import { CAMERA_DIRECTION } from "../cameraBounds";
import { viewDirectionXZ } from "./sunDirection";
import { TRADE_WIND, windFor } from "./wind";
import { SCENE_WIND } from "./sceneWind";
import { TRADE_WIND_SEA, WIND_ANGLE } from "./oceanWaves";
import { PALM_WIND_DIR } from "./palmSway";
import { WIND_TOWARD } from "./shoreFoam";

describe("windFor", () => {
  it("is pure: the same weather gives deep-equal winds, as fresh objects", () => {
    const a = windFor(TRADE_WIND);
    windFor({ ...TRADE_WIND, swingFromViewDeg: 40, speed: 2 });
    const b = windFor(TRADE_WIND);
    expect(b).toEqual(a);
    expect(b).not.toBe(a);
  });

  it("blows the trade wind the sea was tuned with: away from the camera, swung 25° to screen left, at 7 m/s", () => {
    const [vx, vz] = viewDirectionXZ(CAMERA_DIRECTION);
    const wind = windFor(TRADE_WIND);
    // Bit for bit the sea's old WIND_ANGLE, so the waves do not change.
    expect(wind.angle).toBe(Math.atan2(vz, vx) + (-25 * Math.PI) / 180);
    expect(wind.speed).toBe(7);
  });

  it("points `toward` along its angle, at unit length", () => {
    for (const swingFromViewDeg of [-170, -25, 0, 60, 135]) {
      const wind = windFor({ ...TRADE_WIND, swingFromViewDeg });
      expect(Math.hypot(...wind.toward)).toBeCloseTo(1, 12);
      expect(wind.toward[0]).toBeCloseTo(Math.cos(wind.angle), 12);
      expect(wind.toward[1]).toBeCloseTo(Math.sin(wind.angle), 12);
    }
  });

  it("turns with its swing and strengthens with its speed", () => {
    const a = windFor(TRADE_WIND);
    const b = windFor({ ...TRADE_WIND, swingFromViewDeg: TRADE_WIND.swingFromViewDeg + 90 });
    expect(b.angle - a.angle).toBeCloseTo(Math.PI / 2, 12);
    expect(windFor({ ...TRADE_WIND, speed: 12 }).speed).toBe(12);
  });
});

describe("one wind for the scene (#204)", () => {
  it("is the trade wind", () => {
    expect(SCENE_WIND).toEqual(windFor(TRADE_WIND));
  });

  it("is the wind the sea's spectrum is built on", () => {
    expect(WIND_ANGLE).toBe(SCENE_WIND.angle);
    expect(TRADE_WIND_SEA.windSpeed).toBe(SCENE_WIND.speed);
  });

  it("is the wind the palms bend in and the reefs foam to windward of", () => {
    expect(PALM_WIND_DIR).toEqual(SCENE_WIND.toward);
    expect(WIND_TOWARD).toEqual(SCENE_WIND.toward);
  });
});
