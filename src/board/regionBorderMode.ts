/**
 * How the borders between regions are drawn (#239), while the look is being
 * chosen: `water`, a soft seam written into the sea with the regions' names
 * (`regionChart.ts`), or `line`, the faint parchment line on the water grid
 * (`useRegionBorders.ts`). Picked with the dev URL parameter
 * `?regionBorder=water|line`.
 */
export const REGION_BORDER_MODES = ["water", "line"] as const;
export type RegionBorderMode = (typeof REGION_BORDER_MODES)[number];
export const DEFAULT_REGION_BORDER_MODE: RegionBorderMode = "water";
