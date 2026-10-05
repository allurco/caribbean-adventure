/** Builds the land and seabed mesh once per map, shared by every world copy (#36). */
import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, Uint32BufferAttribute } from "three";
import type { Texture } from "three";
import type { MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { sharedTerrainField } from "./sharedTerrainField";
import { buildLandMesh, type LandMeshArrays, type LandMeshColors } from "./landMesh";
import { paletteColor, type PaletteName } from "./palette";
import { createReefMask } from "./reefMask";
import { perMapCache } from "./perMapCache";
import { injectSeabedCaustics } from "./seabedCaustics";
import type { Vec3 } from "./sunDirection";

/** Palette entry as linear RGB, the space vertex colours are read in. */
function linearRgb(name: PaletteName): [number, number, number] {
  const { r, g, b } = paletteColor(name);
  return [r, g, b];
}

const JUNGLE = linearRgb("jungle");
const ROCK = linearRgb("highlandRock");
/** Share of rock in the flat highland colour: mossy upland between jungle and bare rock. */
const HIGHLAND_ROCK_SHARE = 0.55;

const LAND_COLORS: LandMeshColors = {
  wetSand: linearRgb("wetSand"),
  drySand: linearRgb("drySand"),
  jungle: JUNGLE,
  highland: [
    JUNGLE[0] + (ROCK[0] - JUNGLE[0]) * HIGHLAND_ROCK_SHARE,
    JUNGLE[1] + (ROCK[1] - JUNGLE[1]) * HIGHLAND_ROCK_SHARE,
    JUNGLE[2] + (ROCK[2] - JUNGLE[2]) * HIGHLAND_ROCK_SHARE,
  ],
  rock: ROCK,
  seabedSand: linearRgb("seabedSand"),
  coral: linearRgb("coral"),
  deepSeabed: linearRgb("deepSeabed"),
};

function geometryFrom({ positions, colors, normals }: LandMeshArrays, index?: Uint32Array): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  // Land: face normals (flatShading lights with screen-space normals anyway,
  // but shadow bias reads these). Seabed: the field's smooth normals.
  geo.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  if (index) geo.setIndex(new Uint32BufferAttribute(index, 1));
  return geo;
}

/** The land and seabed geometry and materials, built once per map and shared by every world copy. */
export interface LandTerrainResources {
  land: BufferGeometry;
  seabed: BufferGeometry;
  material: MeshStandardMaterial;
  seabedMaterial: MeshStandardMaterial;
}

/** The land mesh arrays, built once per map and wrap (`perMapCache`). */
const landMeshOf = perMapCache((cells, wrap) =>
  buildLandMesh(sharedTerrainField(cells, wrap), { colors: LAND_COLORS, sampleReef: createReefMask(cells, wrap) })
);

/** What the seabed's sunlight is focused through (#38 step 6). */
export interface SeabedLighting {
  /** Unit vector toward the sun (the scene's SUN_DIRECTION). */
  sun: Vec3;
  /** The wave cascades' slope textures (useWaveCascades), one per cascade. */
  waveSlopes: readonly Texture[];
}

/** A standard material whose sunlight the waves focus (seabedCaustics.ts); `name` keys the compiled program. */
function causticMaterial(
  parameters: ConstructorParameters<typeof MeshStandardMaterial>[0],
  name: string,
  lighting: SeabedLighting
): MeshStandardMaterial {
  const material = new MeshStandardMaterial(parameters);
  material.onBeforeCompile = (shader) => {
    injectSeabedCaustics(shader, lighting);
  };
  material.customProgramCacheKey = () => `${name}-caustics`;
  return material;
}

/**
 * Builds the land mesh once per map (and wrap); disposes it when the map
 * changes or the owner unmounts. Both materials focus their sunlight
 * through `lighting`'s waves (caustics, seabedCaustics.ts).
 */
export function useLandTerrain(cells: MapCell[], wrap: MapWrap, lighting: SeabedLighting): LandTerrainResources {
  const { land, seabed } = useMemo(() => {
    const mesh = landMeshOf(cells, wrap);
    return { land: geometryFrom(mesh.land), seabed: geometryFrom(mesh.seabed, mesh.seabed.index) };
  }, [cells, wrap]);

  useEffect(
    () => () => {
      land.dispose();
      seabed.dispose();
    },
    [land, seabed]
  );

  // Both materials focus their sunlight through the waves above (caustics,
  // #38 step 6): the land too, because every triangle with a vertex above sea
  // level is land, and its submerged part reaches a few metres down along the
  // shore, where the caustics are sharpest. Above the waterline the factor is 1.
  const { sun, waveSlopes } = lighting;
  const material = useMemo(
    () => causticMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 }, "land", { sun, waveSlopes }),
    [sun, waveSlopes]
  );
  useEffect(() => () => material.dispose(), [material]);

  // The seabed is smooth-shaded so no facets show through clear water.
  const seabedMaterial = useMemo(
    () => causticMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }, "seabed", { sun, waveSlopes }),
    [sun, waveSlopes]
  );
  useEffect(() => () => seabedMaterial.dispose(), [seabedMaterial]);

  return useMemo(() => ({ land, seabed, material, seabedMaterial }), [land, seabed, material, seabedMaterial]);
}

