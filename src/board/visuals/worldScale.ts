/**
 * Render scale: how many real-world metres one world unit stands for.
 *
 * Wave spectra, dispersion (ω² = g·k) and water absorption (per metre) are
 * physical, so the renderer needs one constant to convert them. It is set by
 * what is on screen: a galleon model is 0.8 units long, and a real galleon is
 * about 50 m, so one unit is about 65 m and a hex reads as ~115 m across.
 *
 * This is the scale of the picture only. How far a move travels in the game's
 * fiction is abstract and not tied to it.
 */
export const METRES_PER_UNIT = 65;

export function metresToUnits(metres: number): number {
  return metres / METRES_PER_UNIT;
}

export function unitsToMetres(units: number): number {
  return units * METRES_PER_UNIT;
}
