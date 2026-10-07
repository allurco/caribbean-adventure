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
import { HEX_METRES, HEX_METRES_TODAY, WATER_FOLLOWS_HEX_SCALE } from "./propScale";

export const METRES_PER_UNIT = metresPerUnitFor(WATER_FOLLOWS_HEX_SCALE ? HEX_METRES : HEX_METRES_TODAY);

/**
 * The #84 experiment (throwaway): with `&scaleWater=1` the unit follows the
 * hex scale, 65 × (hexMetres / 115), so the wave spectra, absorption, seabed
 * shelf and every other metre-based size read the new scale. 65 otherwise.
 */
export function metresPerUnitFor(hexMetres: number): number {
  return hexMetres === HEX_METRES_TODAY ? 65 : 65 * (hexMetres / HEX_METRES_TODAY);
}

export function metresToUnits(metres: number): number {
  return metres / METRES_PER_UNIT;
}

export function unitsToMetres(units: number): number {
  return units * METRES_PER_UNIT;
}
