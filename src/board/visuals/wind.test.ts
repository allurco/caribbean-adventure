import { describe, expect, it } from "vitest";
import { CAMERA_DIRECTION } from "../cameraBounds";
import { viewDirectionXZ } from "./sunDirection";
import { TRADE_WIND, windFor } from "./wind";
import { SCENE_WIND } from "./sceneWind";
import { TRADE_WIND_SEA, WIND_ANGLE } from "./oceanWaves";
import { PALM_WIND_DIR } from "./palmSway";
import { WIND_TOWARD } from "./shoreFoam";

describe("the game's trade wind on the board (#264)", () => {
  it("blows away from the camera, swung 25° to screen left: bit for bit the angle the sea was tuned with", () => {
    const [vx, vz] = viewDirectionXZ(CAMERA_DIRECTION);
    const wind = windFor(TRADE_WIND);
    // Bit for bit the sea's old WIND_ANGLE (from the view), so the waves do not change.
    expect(wind.angle).toBe(Math.atan2(vz, vx) + (-25 * Math.PI) / 180);
    expect(wind.speed).toBe(7);
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
