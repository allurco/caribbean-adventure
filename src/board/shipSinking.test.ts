import { describe, it, expect } from "vitest";
import { SHIP_SINK_DEPTH } from "./shipHull";
import { SINK_DURATION, sinkPose, sinkProgress } from "./shipSinking";

describe("sinkPose (#135)", () => {
  it("starts afloat, level and opaque", () => {
    expect(sinkPose(0)).toEqual({ drop: 0, roll: 0, pitch: 0, opacity: 1 });
  });

  it("ends under by the sink depth, rolled an eighth of a turn, pitched a sixteenth, and gone", () => {
    const end = sinkPose(1);
    expect(end.drop).toBeCloseTo(SHIP_SINK_DEPTH);
    expect(end.roll).toBeCloseTo(Math.PI / 4);
    expect(end.pitch).toBeCloseTo(Math.PI / 8);
    expect(end.opacity).toBeCloseTo(0);
  });

  it("eases in and out: halfway through time is halfway down and half faded", () => {
    const mid = sinkPose(0.5);
    expect(mid.drop).toBeCloseTo(SHIP_SINK_DEPTH / 2);
    expect(mid.opacity).toBeCloseTo(0.5);
    expect(sinkPose(0.1).opacity).toBeGreaterThan(0.9);
  });

  it("fades as it sinks, never back", () => {
    let last = sinkPose(0);
    for (let k = 1; k <= 20; k++) {
      const pose = sinkPose(k / 20);
      expect(pose.opacity).toBeLessThanOrEqual(last.opacity);
      expect(pose.drop).toBeGreaterThanOrEqual(last.drop);
      last = pose;
    }
  });

  it("holds the ends outside 0..1", () => {
    expect(sinkPose(-1)).toEqual(sinkPose(0));
    expect(sinkPose(2)).toEqual(sinkPose(1));
  });
});

describe("sinkProgress", () => {
  it("steps over SINK_DURATION seconds and stops at 1", () => {
    expect(sinkProgress(0, SINK_DURATION / 4)).toBeCloseTo(0.25);
    expect(sinkProgress(0.9, SINK_DURATION)).toBe(1);
  });
});
