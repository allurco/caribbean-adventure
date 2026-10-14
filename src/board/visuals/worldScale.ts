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
 * vegetation `VEGETATION_SCALE` and the town's pieces (piers, quays, the
 * clutter) `TOWN_PIECE_SCALE`; each slice of #158 flips its own. The derived props
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
/** How much bigger than true scale ADR 0003 drew the buildings: the base the buildings' and landmarks' enlargements build on. */
export const BUILDING_TRUE_SCALE = 1.125;
/**
 * How much bigger than ADR 0003's buildings the village is drawn (ADR 0006,
 * #176): a house is then about 0.08 of a hex across and about palm height,
 * and a port holds about two dozen of them on its town cells.
 */
export const BUILDING_ENLARGEMENT = 2.5;
/** Factor on every port building (and its flag), its footprint, margins and footing rule, and on the town plateau: ×2.5 on ADR 0003's (ADR 0006). */
export const BUILDING_SCALE = PROP_SCALE * BUILDING_TRUE_SCALE * BUILDING_ENLARGEMENT;
/**
 * How much bigger than ADR 0003's buildings the landmarks are drawn (#158
 * decision 15, #176): less than the houses, so the watchtower and the church
 * mark the port without swallowing the town.
 */
export const LANDMARK_ENLARGEMENT = 1.6;
/** Factor for the landmarks (the watchtower, the church; the fort when #88 lands): ×1.6 on ADR 0003's buildings (ADR 0006). */
export const LANDMARK_SCALE = PROP_SCALE * BUILDING_TRUE_SCALE * LANDMARK_ENLARGEMENT;
/** Factor for the vegetation (palms, shrubs, town palms): today's prop factor, until the island-look slice of #158 (ADR 0006). */
export const VEGETATION_SCALE = PROP_SCALE;
/** Factor for the town's pieces (piers, quays, the clutter): the buildings' (#176, ADR 0006). */
export const TOWN_PIECE_SCALE = BUILDING_SCALE;
/** The densest the derived props go, as a multiple of their authored count per cell. */
export const PROP_DENSITY_CAP = 80;

/** How many times their authored count per cell the derived props get at prop scale `scale`: the inverse square, rounded, capped. */
export function propDensityFor(scale: number): number {
  if (scale >= 1) return 1;
  return Math.min(PROP_DENSITY_CAP, Math.max(1, Math.round(1 / (scale * scale))));
}

/** Multiplier on the derived props' counts per cell (stones, shrubs, shore boulders, companion palms and rocks). */
export const PROP_DENSITY = propDensityFor(PROP_SCALE);
