/**
 * Clock for the FFT waves (#38). Wave frequencies are rounded to whole cycles
 * per WAVE_LOOP_SECONDS (waveDispersion.ts), so the field repeats exactly
 * after one loop and the clock wraps there without a jump, and the GPU never
 * multiplies a growing time. Like the surf clock, it runs on frame deltas so
 * reduced motion can freeze it without a jump.
 */

/**
 * Loop length, s. The rounding moves each frequency by at most half a cycle
 * per loop, 2π / (2 · 256) ≈ 0.012 rad/s: under 4% for the longest wave of a
 * 500 m tile (0.35 rad/s), well under 1% around the peak.
 */
export const WAVE_LOOP_SECONDS = 256;
/** Longest step one frame may take; longer gaps (a hidden tab) are clamped to it. */
const WAVE_MAX_FRAME_STEP = 0.1;

/** The wave clock after a frame of `deltaSeconds`, wrapped to [0, WAVE_LOOP_SECONDS). */
export function advanceWaveTime(current: number, deltaSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current;
  const next = (current + Math.min(deltaSeconds, WAVE_MAX_FRAME_STEP)) % WAVE_LOOP_SECONDS;
  return next < 0 ? next + WAVE_LOOP_SECONDS : next;
}

/** Seconds the wave clock advanced from reading `from` to reading `to` (one step at most, across the wrap). */
export function waveTimeStep(from: number, to: number): number {
  const step = to - from;
  return step >= 0 ? step : step + WAVE_LOOP_SECONDS;
}
