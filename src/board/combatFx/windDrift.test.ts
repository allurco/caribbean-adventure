import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { windDrift } from "./windDrift";
import { viewAxis } from "./frameWriters";
import { TRADE_WIND, windFor } from "../visuals/wind";
import { SCENE_WIND } from "../visuals/sceneWind";
import { flagStreamDirection } from "../shipWind";
import { SHIP_MODEL_ROTATION_Y } from "../shipModels";

const unit = ([x, z]: readonly [number, number]) => {
  const l = Math.hypot(x, z);
  return [x / l, z / l];
};

describe("the smoke drifts with the one wind (#263)", () => {
  it("downwind in world XZ: the trade wind's own direction", () => {
    const [x, z] = unit(windDrift(SCENE_WIND, 0.05));
    const [tx, tz] = windFor(TRADE_WIND).toward;
    expect(x).toBeCloseTo(tx, 9);
    expect(z).toBeCloseTo(tz, 9);
    expect(Math.hypot(...windDrift(SCENE_WIND, 0.05))).toBeCloseTo(0.05, 9);
  });

  it("the way the flags stream, whatever the ship's heading", () => {
    const [x, z] = unit(windDrift(SCENE_WIND, 1));
    for (const heading of [0, 0.7, 2, -2.5]) {
      // The flag's direction in its model's frame, turned back into the world (Ship.tsx's group, then the model's half turn).
      const [fx, fz] = flagStreamDirection(heading, SCENE_WIND);
      const yaw = heading + SHIP_MODEL_ROTATION_Y;
      const world = new Vector3(fx, 0, fz).applyAxisAngle(new Vector3(0, 1, 0), yaw);
      expect(world.x).toBeCloseTo(x, 9);
      expect(world.z).toBeCloseTo(z, 9);
    }
  });
});

describe("a smoke bank is stretched along the wind as the camera sees it", () => {
  it("a wind blowing away from a camera that looks north reads up the screen", () => {
    const camera = new Matrix4().lookAt(new Vector3(0, 5, 5), new Vector3(0, 0, 0), new Vector3(0, 1, 0)).setPosition(0, 5, 5);
    const view = camera.clone().invert();
    const out: [number, number] = [0, 0];
    viewAxis(0, -1, view, out);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(1, 6);
    viewAxis(1, 0, view, out); // east reads to the right
    expect(out[0]).toBeCloseTo(1, 6);
    expect(Math.hypot(...out)).toBeCloseTo(1, 9);
  });
});
