/**
 * Clock for the animated shore surf in `Ocean.tsx` (issue #10).
 *
 * The surf shader only sees `surfTime`, a per-effect clock kept on the CPU and
 * wrapped to SURF_LOOP_SECONDS. Every time-driven term in the shader is a
 * sin/cos of `2π · surfTime / period` for a period that divides the loop, so
 * the wrap is seamless and the shader never adds a growing time to
 * coordinates (which loses float32 precision over a long session).
 *
 * The clock advances by frame delta rather than reading wall time, so the
 * reduced-motion rate can change mid-session without the surf jumping.
 */

/** Seconds for one full pulse of the surf toward and away from the shore. */
export const SURF_PULSE_PERIOD = 8;
/** Seconds for one cycle of the foam's churning noise offset. */
export const SURF_CHURN_PERIOD = 5;
/** Wrap length of the surf clock: a whole number of every period above. */
export const SURF_LOOP_SECONDS = 120;
/** Longest step one frame may take; longer gaps (a hidden tab) are clamped to it. */
export const SURF_MAX_FRAME_STEP = 0.1;
/** Clock rate under `prefers-reduced-motion: reduce`: 0 freezes the surf in place. */
export const SURF_REDUCED_MOTION_RATE = 0;

/** How fast the surf clock runs relative to real time. */
export function surfTimeRate(reducedMotion: boolean): number {
  return reducedMotion ? SURF_REDUCED_MOTION_RATE : 1;
}

/** The surf clock after a frame of `deltaSeconds`, wrapped to [0, SURF_LOOP_SECONDS). */
export function advanceSurfTime(current: number, deltaSeconds: number, reducedMotion: boolean): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current;
  const step = Math.min(deltaSeconds, SURF_MAX_FRAME_STEP) * surfTimeRate(reducedMotion);
  const next = (current + step) % SURF_LOOP_SECONDS;
  return next < 0 ? next + SURF_LOOP_SECONDS : next;
}

/**
 * The one surf clock as a uniform (#38 step 7): the water advances it each
 * frame and the land's shoreline patch (shoreFoamLand.ts) shares the very
 * same object, so the wash on the sand pulses and churns in step with the
 * wash on the water.
 */
export const surfTimeUniform: { value: number } = { value: 0 };

/** The periods as GLSL constants, so the shader and the CPU loop agree. */
export const SURF_TIMING_GLSL = `
  const float SURF_PULSE_PERIOD = ${SURF_PULSE_PERIOD.toFixed(1)};
  const float SURF_CHURN_PERIOD = ${SURF_CHURN_PERIOD.toFixed(1)};
`;
