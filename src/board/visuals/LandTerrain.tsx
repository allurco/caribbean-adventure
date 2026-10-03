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

const LAND_COLORS: LandMeshColors = {
  wetSand: linearRgb("wetSand"),
  drySand: linearRgb("drySand"),
  jungle: linearRgb("jungle"),
  highlandRock: linearRgb("highlandRock"),
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
