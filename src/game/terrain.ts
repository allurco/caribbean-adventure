export const TERRAINS = ["water", "island"] as const;

export type Terrain = (typeof TERRAINS)[number];
