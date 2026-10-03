import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from "three";
import type { MapCell } from "../../game/types";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import { buildLandMesh } from "./landMesh";

interface LandTerrainProps {
  cells: MapCell[];
}

/** All islands as one continuous, flat-shaded mesh sampled from the terrain height field. */
export function LandTerrain({ cells }: LandTerrainProps) {
  const geometry = useMemo(() => {
    const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
    const { positions, colors } = buildLandMesh(field);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
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
