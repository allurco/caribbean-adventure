/**
 * The names of the board's seeded features (ADR 0007, #165). Pure.
 *
 * Every seeded visual draws from `stream(subSeed(worldSeed, SEED_FEATURES.x,
 * ...ids))`, where the world seed is `G.mapSeed` and the ids are the stable
 * ones of `islands.ts` (a cell or port id, then an index within it). Keeping
 * the names in one place keeps them distinct, so no two features share a
 * stream. A name is part of the picture: renaming one reshuffles that feature
 * (and only that one) on every seed.
 */
export const SEED_FEATURES = {
  /** The terrain field's coastline noise (`terrainHeightField.ts`). */
  coastNoise: "coastNoise",
  /** The terrain field's interior relief noise. */
  reliefNoise: "reliefNoise",
  /** The terrain field's reef-crest noise. */
  reefNoise: "reefNoise",
  /** The land mesh's biome-band boundary and coral-patch noise (`landMesh.ts`). */
  landBandNoise: "landBandNoise",
  /** A generator tree's or rock's companions, per cell and decoration index (`decorationLayout.ts`). */
  companions: "companions",
  /** A palm's look (`palmVariation.ts`), per cell, decoration index and companion index. */
  palmLook: "palmLook",
  /** A generator rock's look (`rockVariation.ts`), per cell, decoration index and companion index. */
  rockLook: "rockLook",
  /** The small stones of a cell (`smallStones.ts`). */
  smallStones: "smallStones",
  /** A small stone's look, per cell and stone index. */
  stoneLook: "stoneLook",
  /** The shrubs of a cell (`shrubPlacement.ts`). */
  shrubs: "shrubs",
  /** A shrub's look (`shrubVariation.ts`), per cell and shrub index. */
  shrubLook: "shrubLook",
  /** The boulders along one coastal edge (`shoreBoulders.ts`), per cell and edge index. */
  shoreBoulders: "shoreBoulders",
  /** A shore boulder's look, per cell, edge index and sample index. */
  boulderLook: "boulderLook",
  /** A port's kit buildings (`portSettlement.ts`), per port. */
  portBuildings: "portBuildings",
  /** A port's quay size (`quayPlacement.ts`), per port. */
  quay: "quay",
  /** Which neighbouring land cells a port's town spills onto (`townCells.ts`), per port. */
  townSpill: "townSpill",
  /** A port's village houses (`villageLayout.ts`), per port. */
  village: "village",
  /** Which of a port's village houses are thinned back to the target (`villageLayout.ts`, #176), per port. */
  villageThinning: "villageThinning",
  /** How many further piers a port gains and which spots on its shore they take (`harbourFurniture.ts`, #181), per port. */
  piers: "piers",
  /** A port's market hall: where round its square it is looked for first (`harbourFurniture.ts`, #181), per port. */
  marketHall: "marketHall",
  /** How many dock cranes a port stands and on which side of a pier they are looked for first (`harbourFurniture.ts`, #181), per port. */
  cranes: "cranes",
  /** A port's town clutter (`townDetailLayout.ts`), per port. */
  townClutter: "townClutter",
  /** The stones of a town's retaining walls, per port, riser and wall segment. */
  retainingWalls: "retainingWalls",
  /** The kerb stones of a town's street, per port and street index. */
  kerbs: "kerbs",
  /** An island's archetype (`islandArchetypes.ts`, #177), per island. */
  archetype: "archetype",
  /** An island's continuous look parameters (`islandLook.ts`, #177), per island and parameter name. */
  islandLook: "islandLook",
  /** The heading a ship lies at before it first sails (`shipSpawnHeading.ts`), per ship id. */
  shipSpawnHeading: "shipSpawnHeading",
  /** Which of a volley's shots hit and when each gun fires (`combatFx/combatTimeline.ts`, #263), per fight, round and shooter. */
  combatShots: "combatShots",
  /** The look of a fight's smoke, splinters, spray and foam (`combatFx/combatDirector.ts`, #263), per fight. */
  combatEffects: "combatEffects",
  /** Where and when a ship sheds its foam flecks (`foamFlecks.ts`, #389), per ship id. */
  shipFoamFlecks: "shipFoamFlecks",
} as const;

export type SeedFeature = (typeof SEED_FEATURES)[keyof typeof SEED_FEATURES];
