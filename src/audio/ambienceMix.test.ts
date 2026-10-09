import { describe, it, expect } from "vitest";
import {
  AMBIENCE_CLOSE_DISTANCE,
  AMBIENCE_WIDE_DISTANCE,
  AMBIENCE_WIDE_FLOOR,
  ambienceBlend,
  ambienceMix,
} from "./ambienceMix";
import { SHIP_VIEW_DISTANCE } from "../board/shipView";
import { CAMERA_MAX_DISTANCE, CAMERA_MIN_DISTANCE } from "../board/cameraBounds";

describe("ambience blend", () => {
  it("is 0 at ship zoom and closer, 1 at the wide distance and beyond", () => {
    expect(ambienceBlend(CAMERA_MIN_DISTANCE)).toBe(0);
    expect(ambienceBlend(AMBIENCE_CLOSE_DISTANCE)).toBe(0);
    expect(ambienceBlend(AMBIENCE_WIDE_DISTANCE)).toBe(1);
    expect(ambienceBlend(CAMERA_MAX_DISTANCE)).toBe(1);
  });

  it("reaches halfway at the geometric middle of the band (zoom is multiplicative)", () => {
    const middle = Math.sqrt(AMBIENCE_CLOSE_DISTANCE * AMBIENCE_WIDE_DISTANCE);
    expect(ambienceBlend(middle)).toBeCloseTo(0.5, 6);
  });

  it("rises monotonically with distance", () => {
    let last = -1;
    for (let d = CAMERA_MIN_DISTANCE; d <= CAMERA_MAX_DISTANCE; d += 0.25) {
      const t = ambienceBlend(d);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it("treats a missing or broken distance as ship zoom", () => {
    expect(ambienceBlend(0)).toBe(0);
    expect(ambienceBlend(-3)).toBe(0);
    expect(ambienceBlend(Number.NaN)).toBe(0);
    expect(ambienceBlend(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("ambience mix", () => {
  it("plays the close water fully at ship zoom, with the wide sea at its floor", () => {
    expect(AMBIENCE_CLOSE_DISTANCE).toBe(SHIP_VIEW_DISTANCE);
    expect(ambienceMix(SHIP_VIEW_DISTANCE)).toEqual({ close: 1, wide: AMBIENCE_WIDE_FLOOR });
  });

  it("keeps the close mix at town zoom", () => {
    expect(ambienceMix(CAMERA_MIN_DISTANCE)).toEqual({ close: 1, wide: AMBIENCE_WIDE_FLOOR });
  });

  it("plays only the wide sea at map zoom", () => {
    const mix = ambienceMix(CAMERA_MAX_DISTANCE);
    expect(mix.wide).toBe(1);
    expect(mix.close).toBeCloseTo(0, 12);
  });

  it("keeps the wide floor below full and above silence", () => {
    expect(AMBIENCE_WIDE_FLOOR).toBeGreaterThan(0);
    expect(AMBIENCE_WIDE_FLOOR).toBeLessThan(1);
  });

  it("crossfades without a dip in loudness (equal power or more)", () => {
    for (let d = CAMERA_MIN_DISTANCE; d <= CAMERA_MAX_DISTANCE; d += 0.1) {
      const { wide, close } = ambienceMix(d);
      expect(wide * wide + close * close).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it("keeps both gains within 0..1, close falling and wide rising with distance", () => {
    let last = ambienceMix(CAMERA_MIN_DISTANCE);
    for (let d = CAMERA_MIN_DISTANCE; d <= CAMERA_MAX_DISTANCE; d += 0.1) {
      const mix = ambienceMix(d);
      for (const g of [mix.wide, mix.close]) {
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
      }
      expect(mix.close).toBeLessThanOrEqual(last.close);
      expect(mix.wide).toBeGreaterThanOrEqual(last.wide);
      last = mix;
    }
  });
});
