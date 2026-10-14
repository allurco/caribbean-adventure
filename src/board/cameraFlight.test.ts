import { describe, it, expect } from "vitest";
import { FLIGHT_ALPHA, REDUCED_GLIDE_ALPHA, REDUCED_GLIDE_REACH, flightStep, flightStyle } from "./cameraFlight";

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

describe("flightStyle (#229)", () => {
  const view = { x: 0, z: 0, distance: 12 };

  it("flies the full eased flight without reduced motion, however far", () => {
    expect(flightStyle(view, { x: 40, z: -30, distance: 4 }, false)).toEqual({ kind: "glide", alpha: FLIGHT_ALPHA });
  });

  it("cuts straight to a far goal under reduced motion", () => {
    expect(flightStyle(view, { x: 20, z: 0, distance: 12 }, true)).toEqual({ kind: "cut" });
  });

  it("cuts to a big change of zoom under reduced motion, even in place", () => {
    expect(flightStyle(view, { x: 0, z: 0, distance: 4 }, true)).toEqual({ kind: "cut" });
  });

  it("glides quickly over a short hop under reduced motion", () => {
    const style = flightStyle(view, { x: 1, z: 0.5, distance: 11 }, true);
    expect(style).toEqual({ kind: "glide", alpha: REDUCED_GLIDE_ALPHA });
  });

  it("keeps the zoom of a goal that names none when judging the hop", () => {
    expect(flightStyle(view, { x: 1, z: 0 }, true).kind).toBe("glide");
  });

  it("makes the reduced glide brief: a handful of frames, not a sweep", () => {
    const goal = { x: REDUCED_GLIDE_REACH, z: 0, distance: 12 };
    let at = view;
    let frames = 0;
    while (!flightStep(at, goal, REDUCED_GLIDE_ALPHA).arrived && frames < 1000) {
      at = flightStep(at, goal, REDUCED_GLIDE_ALPHA);
      frames++;
    }
    expect(frames).toBeLessThan(20);
  });
});
