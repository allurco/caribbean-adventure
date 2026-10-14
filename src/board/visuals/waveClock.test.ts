import { describe, expect, it } from "vitest";
import { WAVE_LOOP_SECONDS, advanceWaveTime, createWaveClock, waveTimeStep } from "./waveClock";

describe("waveTimeStep", () => {
  it("is the seconds the clock advanced between two readings", () => {
    expect(waveTimeStep(1, 1.016)).toBeCloseTo(0.016, 9);
    expect(waveTimeStep(3, 3)).toBe(0);
  });

  it("counts across the wrap", () => {
    expect(waveTimeStep(WAVE_LOOP_SECONDS - 0.01, 0.02)).toBeCloseTo(0.03, 9);
  });
});

describe("advanceWaveTime", () => {
  it("advances by the frame time", () => {
    expect(advanceWaveTime(1, 0.016, false)).toBeCloseTo(1.016, 9);
  });

  it("wraps at the loop length, where the quantised waves repeat exactly", () => {
    expect(advanceWaveTime(WAVE_LOOP_SECONDS - 0.01, 0.03, false)).toBeCloseTo(0.02, 9);
  });

  it("clamps a long gap (a hidden tab) to one short step", () => {
    expect(advanceWaveTime(0, 5, false)).toBeCloseTo(0.1, 9);
  });

  it("freezes the waves under reduced motion", () => {
    expect(advanceWaveTime(3, 0.016, true)).toBe(3);
  });

  it("ignores non-finite and negative steps", () => {
    expect(advanceWaveTime(3, Number.NaN, false)).toBe(3);
    expect(advanceWaveTime(3, -1, false)).toBe(3);
  });
});

describe("createWaveClock", () => {
  it("starts at wave time 0", () => {
    expect(createWaveClock().waveTimeAt()).toBe(0);
  });

  it("reads the time advanced by every frame so far", () => {
    const clock = createWaveClock();
    clock.advance(0.016, false);
    clock.advance(0.02, false);
    expect(clock.waveTimeAt()).toBeCloseTo(0.036, 9);
  });

  it("holds still under reduced motion", () => {
    const clock = createWaveClock();
    clock.advance(0.5, false);
    clock.advance(0.016, true);
    expect(clock.waveTimeAt()).toBeCloseTo(0.1, 9);
  });
});
