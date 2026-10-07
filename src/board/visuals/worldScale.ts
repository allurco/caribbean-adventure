/**
 * The picture's two scales (ADR 0003). Pure, no Three.js.
 *
 * The water: one world unit is 65 m. Wave spectra, dispersion (ω² = g·k),
 * water absorption and the seabed shelf are physical, so the renderer needs
 * one constant to convert them. It was set by the first galleon model (0.8
 * units long for a ship about 50 m), which made a hex about 115 m across.
 *
 * The props: a hex stands for about 350 m. Every authored prop (palms,
 * shrubs, rocks, stones, the port kit) was modelled for the 115 m hex, so
 * it is drawn at `PROP_SCALE` = 115 / 350 of its authored size, with its
 * footprint, clearances and placement margins; buildings take a little
 * more (`BUILDING_SCALE`) so houses do not read as sheds, and ships twice
 * true scale (`SHIP_SCALE`) so they still read at ship and map zoom. The
 * derived props are placed `PROP_DENSITY` times as densely so the land
 * does not go bare. The terrain, the hex grid and the camera keep their
 * world units.
 *
 * The two differ on purpose: scaling the water with the hex washes out the
 * turquoise shallows. Both are the scale of the picture only; how far a
 * move travels in the game's fiction is abstract and not tied to them.
 */
export const METRES_PER_UNIT = 65;

export function metresToUnits(metres: number): number {
  return metres / METRES_PER_UNIT;
}

export function unitsToMetres(units: number): number {
  return units * METRES_PER_UNIT;
}

/** What a hex is across at `METRES_PER_UNIT` (√3 units flat to flat, rounded): the scale the props were authored at. */
export const AUTHORED_HEX_METRES = 115;
/** What a hex stands for in the picture, metres across. */
export const HEX_METRES = 350;
/** Factor on every authored prop's world size, footprint and margins. */
export const PROP_SCALE = AUTHORED_HEX_METRES / HEX_METRES;
/** Factor on the ships (hulls, ride height, sink depth, hull foam): twice true scale. */
export const SHIP_SCALE = 2 * PROP_SCALE;
/** How much bigger than true scale the buildings are drawn. */
export const BUILDING_ENLARGEMENT = 1.125;
/** Factor on every port building (and its flag), its footprint, margins and footing rule. */
export const BUILDING_SCALE = PROP_SCALE * BUILDING_ENLARGEMENT;
/** The densest the derived props go, as a multiple of their authored count per cell. */
export const PROP_DENSITY_CAP = 80;

/** How many times their authored count per cell the derived props get at prop scale `scale`: the inverse square, rounded, capped. */
export function propDensityFor(scale: number): number {
  if (scale >= 1) return 1;
  return Math.min(PROP_DENSITY_CAP, Math.max(1, Math.round(1 / (scale * scale))));
}

/** Multiplier on the derived props' counts per cell (stones, shrubs, shore boulders, companion palms and rocks). */
export const PROP_DENSITY = propDensityFor(PROP_SCALE);
