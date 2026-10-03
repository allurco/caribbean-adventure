/**
 * Clock for the shallow-water caustics in `Ocean.tsx` (issue #11).
 *
 * Same pattern as the surf clock (`surfMotion.ts`): the shader only sees
 * `causticTime`, a CPU clock advanced by frame delta and wrapped to
 * CAUSTIC_LOOP_SECONDS. The caustic shader moves its two noise layers round
 * small circles whose angles are 2π · causticTime / period, for periods that
 * divide the loop, so the wrap is seamless and the shader never adds a growing
 * time to coordinates. It is independent of the wave `iTime`.
 */

/** Seconds for one loop of the first caustic layer's drift. */
export const CAUSTIC_PERIOD_A = 6;
/** Seconds for one loop of the second layer's drift; differs from A so the light web keeps changing. */
export const CAUSTIC_PERIOD_B = 10;
/** Wrap length of the caustic clock: a whole number of both periods. */
export const CAUSTIC_LOOP_SECONDS = 30;
/** Longest step one frame may take; longer gaps (a hidden tab) are clamped to it. */
export const CAUSTIC_MAX_FRAME_STEP = 0.1;
/** Clock rate under `prefers-reduced-motion: reduce`: 0 holds the caustics still. */
export const CAUSTIC_REDUCED_MOTION_RATE = 0;

/** How fast the caustic clock runs relative to real time. */
export function causticTimeRate(reducedMotion: boolean): number {
  return reducedMotion ? CAUSTIC_REDUCED_MOTION_RATE : 1;
}

/** The caustic clock after a frame of `deltaSeconds`, wrapped to [0, CAUSTIC_LOOP_SECONDS). */
export function advanceCausticTime(current: number, deltaSeconds: number, reducedMotion: boolean): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current;
  const step = Math.min(deltaSeconds, CAUSTIC_MAX_FRAME_STEP) * causticTimeRate(reducedMotion);
  const next = (current + step) % CAUSTIC_LOOP_SECONDS;
  return next < 0 ? next + CAUSTIC_LOOP_SECONDS : next;
}

/** The periods as GLSL constants, so the shader and the CPU loop agree. */
export const CAUSTIC_TIMING_GLSL = `
  const float CAUSTIC_PERIOD_A = ${CAUSTIC_PERIOD_A.toFixed(1)};
  const float CAUSTIC_PERIOD_B = ${CAUSTIC_PERIOD_B.toFixed(1)};
`;
