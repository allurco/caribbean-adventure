import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from "three";
import type { Mesh } from "three";
import type { MapCell } from "../../game/types";
import { sharedTerrainField } from "./sharedTerrainField";
import { buildLandMesh, type LandMeshColors } from "./landMesh";
import { paletteColor, type PaletteName } from "./palette";
import { createReefMask } from "./reefMask";
import { SEABED_LAYER } from "./seabedPrepass";

interface LandTerrainProps {
  cells: MapCell[];
}

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

function geometryFrom(positions: Float32Array, colors: Float32Array, normals: Float32Array): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  // Land: face normals (flatShading lights with screen-space normals anyway,
  // but shadow bias reads these). Seabed: the field's smooth normals.
  geo.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  return geo;
}

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
 * prepass that the water shader looks through (#38).
 */
export function LandTerrain({ cells }: LandTerrainProps) {
  const { land, seabed } = useMemo(() => {
    const field = sharedTerrainField(cells);
    const mesh = buildLandMesh(field, { colors: LAND_COLORS, sampleReef: createReefMask(cells) });
    const split = mesh.aboveWaterTriangleCount * 9;
    return {
      land: geometryFrom(
        mesh.positions.subarray(0, split),
        mesh.colors.subarray(0, split),
        mesh.normals.subarray(0, split)
      ),
      seabed: geometryFrom(
        mesh.positions.subarray(split),
        mesh.colors.subarray(split),
        mesh.normals.subarray(split)
      ),
    };
  }, [cells]);

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

  return (
    <>
      <mesh ref={alsoInPrepass} geometry={land} material={material} receiveShadow castShadow />
      <mesh ref={onlyInPrepass} geometry={seabed} material={seabedMaterial} receiveShadow />
    </>
  );
}
