import { describe, expect, it } from "vitest";
import { BEATS, pacedSeconds, MAST_LANDS_AT, beatProgress, easeInOutCubic, frameShips, mastTopple, sinkPose } from "./beatTiming";

describe("beats", () => {
  it("every beat has a label and a positive duration", () => {
    for (const beat of Object.values(BEATS)) {
      expect(beat.label.length).toBeGreaterThan(0);
      expect(beat.seconds).toBeGreaterThan(0);
    }
  });

  it("plays shorter under reduced motion", () => {
    expect(pacedSeconds(4, false)).toBe(4);
    expect(pacedSeconds(4, true)).toBeLessThan(4);
  });

  it("progress runs 0 to 1 over the beat and holds at 1", () => {
    expect(beatProgress(0, 4)).toBe(0);
    expect(beatProgress(2, 4)).toBe(0.5);
    expect(beatProgress(9, 4)).toBe(1);
  });

  it("eases in and out", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
  });
});

describe("mast falls", () => {
  it("stands, then topples faster and faster until it lands, and lies there", () => {
    expect(mastTopple(0)).toBeCloseTo(0, 2);
    const early = mastTopple(MAST_LANDS_AT * 0.5);
    const late = mastTopple(MAST_LANDS_AT * 0.9);
    expect(late - mastTopple(MAST_LANDS_AT * 0.8)).toBeGreaterThan(mastTopple(MAST_LANDS_AT * 0.5) - mastTopple(MAST_LANDS_AT * 0.4));
    expect(early).toBeLessThan(late);
    expect(mastTopple(1)).toBeGreaterThan(Math.PI / 2 - 0.2);
    expect(mastTopple(1)).toBeLessThan(Math.PI / 2 + 0.3);
  });
});

describe("sinking", () => {
  it("goes down by the stern, listing, from afloat to under", () => {
    expect(sinkPose(0)).toEqual({ drop: 0, pitch: 0, heel: 0 });
    const end = sinkPose(1);
    expect(end.drop).toBeGreaterThan(0);
    expect(end.pitch).toBeGreaterThan(0.2); // bow up
    expect(Math.abs(end.heel)).toBeGreaterThan(0.1);
  });
});

describe("declaring: the camera frames both ships", () => {
  it("looks at the midpoint, from further away the further apart they are", () => {
    const near = frameShips({ x: 0, z: 0 }, { x: 1.7, z: 0 }, { fovDeg: 45, aspect: 1.6, shipLength: 0.9 });
    const far = frameShips({ x: 0, z: 0 }, { x: 3.4, z: 0 }, { fovDeg: 45, aspect: 1.6, shipLength: 0.9 });
    expect(near.target[0]).toBeCloseTo(0.85, 6);
    expect(near.target[2]).toBeCloseTo(0, 6);
    expect(far.distance).toBeGreaterThan(near.distance);
  });

  it("fits ships one behind the other in the screen's height, however wide the screen", () => {
    const fovDeg = 45;
    const halfSpan = 1.7 / 2 + 0.9 / 2 + 0.35;
    const frame = frameShips({ x: 0, z: 0 }, { x: 0, z: -1.7 }, { fovDeg, aspect: 1.6, shipLength: 0.9 });
    expect(frame.distance).toBeGreaterThanOrEqual(halfSpan / Math.tan((fovDeg * Math.PI) / 360) - 1e-9);
  });

  it("pulls back on a narrow screen", () => {
    const wide = frameShips({ x: 0, z: 0 }, { x: 1.7, z: 0 }, { fovDeg: 45, aspect: 1.8, shipLength: 0.9 });
    const tall = frameShips({ x: 0, z: 0 }, { x: 1.7, z: 0 }, { fovDeg: 45, aspect: 0.5, shipLength: 0.9 });
    expect(tall.distance).toBeGreaterThan(wide.distance);
  });
});
