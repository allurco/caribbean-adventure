import type { Mesh } from "three";
import { SEABED_LAYER } from "./seabedPrepass";
import type { LandTerrainResources } from "./useLandTerrain";

/** Show a mesh in the seabed prepass as well as the main pass. */
const alsoInPrepass = (mesh: Mesh | null) => {
  mesh?.layers.enable(SEABED_LAYER);
};
/** Show a mesh only in the seabed prepass: the water covers it in the main pass. */
const onlyInPrepass = (mesh: Mesh | null) => {
  mesh?.layers.set(SEABED_LAYER);
};

/**
 * All islands and the seabed around them as one continuous, flat-shaded
 * surface sampled from the terrain height field. Faces reaching above sea
 * level draw in the main pass; the rest is seabed, drawn only into the seabed
 * prepass that the water shader looks through (#38). One per world copy, all
 * drawing the same `terrain` (`useLandTerrain`).
 */
export function LandTerrain({ terrain }: { terrain: LandTerrainResources }) {
  const { land, seabed, material, seabedMaterial } = terrain;
  return (
    <>
      <mesh ref={alsoInPrepass} geometry={land} material={material} receiveShadow castShadow />
      <mesh ref={onlyInPrepass} geometry={seabed} material={seabedMaterial} receiveShadow />
    </>
  );
}
