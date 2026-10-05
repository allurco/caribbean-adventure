/**
 * Total slope statistics of the sea surface (#38), for the roughness of the
 * waves too short for the FFT cascade to carry.
 *
 * Cox & Munk (1954), "Measurement of the roughness of the sea surface from
 * photographs of the sun's glitter", JOSA 44(11): for a clean sea the mean
 * square slope (both axes together) is σ² = 0.003 + 5.12·10⁻³ U, with U the
 * wind speed in m/s (measured at 12.5 m; we feed it the 10 m wind, a few
 * percent low).
 */

/** Total mean square slope of a clean sea under wind speed `windSpeed` (m/s). */
export function coxMunkSlopeVariance(windSpeed: number): number {
  return 0.003 + 5.12e-3 * windSpeed;
}

/** The mean square slope left over once a cascade resolves `resolved` of it. */
export function unresolvedSlopeVariance(windSpeed: number, resolved: number): number {
  return Math.max(0, coxMunkSlopeVariance(windSpeed) - resolved);
}
