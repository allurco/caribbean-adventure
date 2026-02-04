export const TERRAINS = ["water", "island", "reef"] as const;

export type Terrain = (typeof TERRAINS)[number];
