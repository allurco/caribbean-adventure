import { describe, it, expect } from "vitest";
import { flightStep } from "./cameraFlight";

describe("flightStep", () => {
  it("moves the target and the distance the same share of the way", () => {
    const step = flightStep({ x: 0, z: 0, distance: 20 }, { x: 10, z: -4, distance: 4 }, 0.25);
    expect(step.x).toBeCloseTo(2.5);
    expect(step.z).toBeCloseTo(-1);
    expect(step.distance).toBeCloseTo(16);
    expect(step.arrived).toBe(false);
  });

  it("keeps the distance when the goal names none", () => {
    const step = flightStep({ x: 0, z: 0, distance: 20 }, { x: 10, z: 0 }, 0.5);
    expect(step.distance).toBe(20);
    expect(step.x).toBeCloseTo(5);
  });

  it("has not arrived while the zoom is still far off, even over the goal", () => {
    expect(flightStep({ x: 10, z: 0, distance: 20 }, { x: 10, z: 0, distance: 4 }, 0.1).arrived).toBe(false);
  });

  it("arrives once both the focus and the zoom are close", () => {
    const step = flightStep({ x: 9.95, z: 0, distance: 4.03 }, { x: 10, z: 0, distance: 4 }, 0.1);
    expect(step.arrived).toBe(true);
  });

  it("gets there in a bounded number of frames", () => {
    const goal = { x: 30, z: -12, distance: 4.32 };
    let view = { x: 0, z: 0, distance: 28 };
    let frames = 0;
    while (!flightStep(view, goal, 0.08).arrived && frames < 1000) {
      view = flightStep(view, goal, 0.08);
      frames++;
    }
    expect(frames).toBeLessThan(100);
  });
});
