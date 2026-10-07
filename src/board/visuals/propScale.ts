/**
 * The #84 experiment's prop scale (throwaway). Pure, no Three.js.
 *
 * Today a hex is ~115 m across (`worldScale.ts`). `?hexMetres=N` asks what
 * the scene looks like when a hex stands for N metres with the terrain left
 * as it is: every authored prop and ship is drawn at `115 / N` about its
 * ground contact, its placement footprints and clearances shrink with it,
 * and the derived props are placed `PROP_DENSITY` times as densely so the
 * land does not go bare. `&scaleWater=1` also moves `METRES_PER_UNIT` (see
 * `worldScale.ts`).
 *
 * Read once at module load, before any module-level size is computed from
 * it: every consumer imports these constants. With no parameter the factor
 * is exactly 1 and the density 1, so nothing changes.
 */
import { parseDevUrlParams } from "../devUrlParams";

/** What a hex is across today, metres (`METRES_PER_UNIT` 65 × √3 units across the flats, rounded). */
export const HEX_METRES_TODAY = 115;
/** The densest the derived props go, as a multiple of today's count (the inverse square is capped here). */
export const PROP_DENSITY_CAP = 80;

/** The prop scale for a hex of `hexMetres` (absent: today's, 1). */
export function propScaleFor(hexMetres: number | undefined): number {
  return hexMetres === undefined || hexMetres === HEX_METRES_TODAY ? 1 : HEX_METRES_TODAY / hexMetres;
}

/** How many times today's count of derived props a cell gets at prop scale `scale`: the inverse square, rounded, capped. */
export function propDensityFor(scale: number): number {
  if (scale >= 1) return 1;
  return Math.min(PROP_DENSITY_CAP, Math.max(1, Math.round(1 / (scale * scale))));
}

const search = typeof window === "undefined" ? "" : window.location.search;
const params = parseDevUrlParams(search);

/** The hex scale this page was opened at, metres across. */
export const HEX_METRES = params.hexMetres ?? HEX_METRES_TODAY;
/** Factor on every authored prop's and ship's world size (1 unless `?hexMetres` is given). */
export const PROP_SCALE = propScaleFor(params.hexMetres);
/**
 * Factor on the ships (hulls, ride height, sink depth, hull foam): twice
 * true scale, so a ship still reads against the town, never above today's.
 */
export function shipScaleFor(propScale: number): number {
  return propScale >= 0.5 ? 1 : 2 * propScale;
}
/** The ships' factor (1 unless `?hexMetres` is given): `min(1, 2 × PROP_SCALE)`. */
export const SHIP_SCALE = shipScaleFor(PROP_SCALE);
/** How much bigger than true scale the buildings are drawn under `?hexMetres` (#84: 10–15 %). */
export const BUILDING_ENLARGEMENT = 1.125;
/** The buildings' factor for a prop scale: `PROP_SCALE × BUILDING_ENLARGEMENT`, exactly 1 at today's scale. */
export function buildingScaleFor(propScale: number): number {
  return propScale === 1 ? 1 : propScale * BUILDING_ENLARGEMENT;
}
/** Factor on every building (village and port kit), its footprint, margins and footing rule (1 unless `?hexMetres` is given). */
export const BUILDING_SCALE = buildingScaleFor(PROP_SCALE);
/** Multiplier on the derived props' counts per cell (1 unless `?hexMetres` is given). */
export const PROP_DENSITY = propDensityFor(PROP_SCALE);
/** Whether the physical water follows the hex scale (`&scaleWater=1`). */
export const WATER_FOLLOWS_HEX_SCALE = params.scaleWater === true;
