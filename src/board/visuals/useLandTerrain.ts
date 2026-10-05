/** Builds the land and seabed mesh once per map, shared by every world copy (#36). */
import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, Uint32BufferAttribute } from "three";
import type { MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { sharedTerrainField } from "./sharedTerrainField";
import { buildLandMesh, type LandMeshArrays, type LandMeshColors } from "./landMesh";
import { paletteColor, type PaletteName } from "./palette";
import { createReefMask } from "./reefMask";
import { perMapCache } from "./perMapCache";

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

/** Builds the land mesh once per map (and wrap); disposes it when the map changes or the owner unmounts. */
export function useLandTerrain(cells: MapCell[], wrap: MapWrap): LandTerrainResources {
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

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.9,
        metalness: 0,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);

  // The seabed is smooth-shaded so no facets show through clear water.
  const seabedMaterial = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    []
  );
  useEffect(() => () => seabedMaterial.dispose(), [seabedMaterial]);

  return useMemo(() => ({ land, seabed, material, seabedMaterial }), [land, seabed, material, seabedMaterial]);
}

