/**
 * The picture's scales (ADR 0003, ADR 0006). Pure, no Three.js.
 *
 * The water: one world unit is 65 m. Wave spectra, dispersion (ω² = g·k),
 * water absorption and the seabed shelf are physical, so the renderer needs
 * one constant to convert them. It was set by the first galleon model (0.8
 * units long for a ship about 50 m), which made a hex about 115 m across.
 *
 * Everything else: the hex is a board space, not a distance (ADR 0006).
 * Each family of things on it carries its own picture factor, the one that
 * makes it read against the hex at ship and map zoom, rather than one shared
 * metres-per-hex. The props were authored for the 115 m hex; `PROP_SCALE`
 * (115 / 350, from ADR 0003's 350 m hex) is the base the families start
 * from, and rocks and stones stay on it. Ships are `SHIP_SCALE`, buildings
 * `BUILDING_SCALE`, landmarks (the tower, the fort) `LANDMARK_SCALE`,
 * vegetation `VEGETATION_SCALE` and the town's pieces (piers, quays)
 * `TOWN_PIECE_SCALE`; each slice of #158 flips its own. The derived props
 * are placed `PROP_DENSITY` times as densely so the land does not go bare.
 * The terrain, the hex grid and the camera keep their world units.
 *
 * The water and the families differ on purpose: scaling the water with the
 * hex washes out the turquoise shallows. All are the scale of the picture
 * only; how far a move travels in the game's fiction is abstract and not
 * tied to them.
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
/** The hex ADR 0003 drew, metres across: it sets the base prop factor, which ADR 0006 keeps for rocks and stones. */
export const HEX_METRES = 350;
/** Factor on every authored prop's world size, footprint and margins: the base the per-family factors build on. */
export const PROP_SCALE = AUTHORED_HEX_METRES / HEX_METRES;
/**
 * How much bigger the ships are drawn than ADR 0003's twice true scale (ADR
 * 0006): the Frigate's hull is then 0.44 of a hex vertex to vertex, about
 * half a hex at the opening view, and the 42 m Galleon's hull box still
 * clears the hex inradius at every heading (`HULL_FIT_MARGIN`).
 */
export const SHIP_ENLARGEMENT = 2.3;
/** Factor on the ships (hulls, ride height, sink depth, hover box): ×2.3 on twice true scale (ADR 0006). */
export const SHIP_SCALE = SHIP_ENLARGEMENT * 2 * PROP_SCALE;
/** How much bigger than true scale the buildings are drawn. */
export const BUILDING_ENLARGEMENT = 1.125;
/** Factor on every port building (and its flag), its footprint, margins and footing rule. */
export const BUILDING_SCALE = PROP_SCALE * BUILDING_ENLARGEMENT;
/** Factor for the landmarks (watchtower, fort): today's building factor, until the village slice of #158 sets its own (ADR 0006). */
export const LANDMARK_SCALE = BUILDING_SCALE;
/** Factor for the vegetation (palms, shrubs, town palms): today's prop factor, until the island-look slice of #158 (ADR 0006). */
export const VEGETATION_SCALE = PROP_SCALE;
/** Factor for the town's pieces (piers, quays): today's prop factor, until the village slice of #158 (ADR 0006). */
export const TOWN_PIECE_SCALE = PROP_SCALE;
/** The densest the derived props go, as a multiple of their authored count per cell. */
export const PROP_DENSITY_CAP = 80;

/** How many times their authored count per cell the derived props get at prop scale `scale`: the inverse square, rounded, capped. */
export function propDensityFor(scale: number): number {
  if (scale >= 1) return 1;
  return Math.min(PROP_DENSITY_CAP, Math.max(1, Math.round(1 / (scale * scale))));
}

/** Multiplier on the derived props' counts per cell (stones, shrubs, shore boulders, companion palms and rocks). */
export const PROP_DENSITY = propDensityFor(PROP_SCALE);
