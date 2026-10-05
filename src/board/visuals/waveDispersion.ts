/**
 * Deep-water dispersion for the FFT ocean (#38): ω² = g·k, in metres and
 * seconds. Valid where the water is deeper than about half a wavelength,
 * which off the shelf holds for every wave the cascades carry.
 */

/** Standard gravity, m/s². */
export const GRAVITY = 9.81;

/** Angular frequency ω (rad/s) of a deep-water wave of wavenumber `k` (rad/m). */
export function deepWaterFrequency(k: number): number {
  return Math.sqrt(GRAVITY * k);
}

/** dω/dk (the group velocity, m/s) of a deep-water wave of wavenumber `k`. */
export function deepWaterFrequencySlope(k: number): number {
  return GRAVITY / (2 * deepWaterFrequency(k));
}

/**
 * The wave's frequency as a whole number of cycles per `loopSeconds`
 * (Tessendorf's "repeat time" quantisation). The shader turns phase into
 * 2π·fract(multiple · t / loop), so the wave clock can wrap at the loop
 * length with no jump, and the phase never multiplies a large time.
 */
export function wavePeriodMultiple(k: number, loopSeconds: number): number {
  return Math.round((deepWaterFrequency(k) * loopSeconds) / (2 * Math.PI));
}
