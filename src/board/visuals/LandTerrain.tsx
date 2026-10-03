import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from "three";
import type { MapCell } from "../../game/types";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import { buildLandMesh, type LandMeshColors } from "./landMesh";
import { paletteColor, type PaletteName } from "./palette";

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
};

/** All islands as one continuous, flat-shaded mesh sampled from the terrain height field. */
export function LandTerrain({ cells }: LandTerrainProps) {
  const geometry = useMemo(() => {
    const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    const { positions, colors } = buildLandMesh(field, { colors: LAND_COLORS });
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
    // flatShading lights with screen-space face normals, but the shadow-receive
    // code still reads the normal attribute for its normal bias.
    geo.computeVertexNormals();
    return geo;
  }, [cells]);

  useEffect(() => () => geometry.dispose(), [geometry]);

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

  return <mesh geometry={geometry} material={material} receiveShadow castShadow />;
}
