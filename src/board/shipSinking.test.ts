import { describe, it, expect } from "vitest";
import { SHIP_CLASSES } from "../game/types";
import { SHIP_SINK_DEPTH, shipDeckHeight } from "./shipHull";
import { SETTLE_SECONDS, SINK_DURATION, sinkOpacity, sinkPose, sinkProgress } from "./shipSinking";

const SLOOP_DECK = shipDeckHeight("Sloop");

describe("sinkPose (#135)", () => {
  it("starts afloat, level and opaque", () => {
    expect(sinkPose(0, SLOOP_DECK)).toEqual({ drop: 0, roll: 0, pitch: 0, opacity: 1 });
  });

  it("ends under by the sink depth, rolled an eighth of a turn, pitched a sixteenth, and gone", () => {
    const end = sinkPose(1, SLOOP_DECK);
    expect(end.drop).toBeCloseTo(SHIP_SINK_DEPTH);
    expect(end.roll).toBeCloseTo(Math.PI / 4);
    expect(end.pitch).toBeCloseTo(Math.PI / 8);
    expect(end.opacity).toBe(0);
  });

  it("settles for SETTLE_SECONDS, her deck going under at about 0.8 s, for every class", () => {
    expect(SETTLE_SECONDS).toBeCloseTo(0.8);
    for (const shipClass of [...SHIP_CLASSES, undefined]) {
      const deck = shipDeckHeight(shipClass);
      const steps = 2000;
      let under = Infinity;
      for (let k = 0; k <= steps; k++) {
        const seconds = (k / steps) * SINK_DURATION;
        if (sinkPose(seconds / SINK_DURATION, deck).drop >= deck - 1e-9) {
          under = seconds;
          break;
        }
      }
      expect(Math.abs(under - 0.8)).toBeLessThanOrEqual(0.1);
    }
  });

  it("is seen to fade: still over half there at 0.4 s, gone as her deck goes under, for every class", () => {
    for (const shipClass of [...SHIP_CLASSES, undefined]) {
      const deck = shipDeckHeight(shipClass);
      expect(sinkPose(0.4 / SINK_DURATION, deck).opacity).toBeGreaterThan(0.5);
      expect(sinkPose(0.4 / SINK_DURATION, deck).opacity).toBeLessThan(1);
      expect(sinkPose(SETTLE_SECONDS / SINK_DURATION, deck).opacity).toBeLessThan(0.02);
    }
  });

  it("goes on down to the sink depth once she is under, never rising", () => {
    const after = sinkPose(SETTLE_SECONDS / SINK_DURATION + 0.01, SLOOP_DECK);
    expect(after.drop).toBeGreaterThanOrEqual(SLOOP_DECK);
    expect(sinkPose(0.9, SLOOP_DECK).drop).toBeLessThan(SHIP_SINK_DEPTH);
  });

  it("rolls and pitches on the whole sink's eased curve: halfway through time, halfway over", () => {
    const mid = sinkPose(0.5, SLOOP_DECK);
    expect(mid.roll).toBeCloseTo(Math.PI / 8);
    expect(mid.pitch).toBeCloseTo(Math.PI / 16);
  });

  it("fades faster than she sinks: she is always more faded than she is down", () => {
    for (const shipClass of SHIP_CLASSES) {
      const deck = shipDeckHeight(shipClass);
      for (let k = 1; k < 20; k++) {
        const pose = sinkPose(k / 20, deck);
        expect(pose.opacity).toBeLessThan(1 - pose.drop / SHIP_SINK_DEPTH);
      }
    }
  });

  it("fades as it sinks, never back", () => {
    let last = sinkPose(0, SLOOP_DECK);
    for (let k = 1; k <= 40; k++) {
      const pose = sinkPose(k / 40, SLOOP_DECK);
      expect(pose.opacity).toBeLessThanOrEqual(last.opacity);
      expect(pose.drop).toBeGreaterThanOrEqual(last.drop);
      last = pose;
    }
  });

  it("holds the ends outside 0..1", () => {
    expect(sinkPose(-1, SLOOP_DECK)).toEqual(sinkPose(0, SLOOP_DECK));
    expect(sinkPose(2, SLOOP_DECK)).toEqual(sinkPose(1, SLOOP_DECK));
  });
});

describe("sinkOpacity (#135)", () => {
  it("is opaque afloat and gone by the time her deck meets the water, for every class", () => {
    for (const shipClass of [...SHIP_CLASSES, undefined]) {
      const deck = shipDeckHeight(shipClass);
      expect(sinkOpacity(0, deck)).toBe(1);
      expect(sinkOpacity(deck, deck)).toBeLessThan(0.02);
      expect(sinkOpacity(SHIP_SINK_DEPTH, deck)).toBe(0);
    }
  });

  it("dissolves as she settles: half faded with her deck half way to the water", () => {
    expect(sinkOpacity(SLOOP_DECK / 2, SLOOP_DECK)).toBeGreaterThan(0.3);
    expect(sinkOpacity(SLOOP_DECK / 2, SLOOP_DECK)).toBeLessThan(0.7);
  });

  it("never fades a ship that has not gone down (a prize taken afloat), nor one risen above her waterline", () => {
    expect(sinkOpacity(0, SLOOP_DECK)).toBe(1);
    expect(sinkOpacity(-0.1, SLOOP_DECK)).toBe(1);
  });

  it("falls steadily with the drop", () => {
    let last = 1;
    for (let k = 1; k <= 20; k++) {
      const o = sinkOpacity((k / 20) * SLOOP_DECK, SLOOP_DECK);
      expect(o).toBeLessThan(last);
      last = o;
    }
  });
});

describe("sinkProgress", () => {
  it("steps over SINK_DURATION seconds and stops at 1", () => {
    expect(sinkProgress(0, SINK_DURATION / 4)).toBeCloseTo(0.25);
    expect(sinkProgress(0.9, SINK_DURATION)).toBe(1);
  });
});
