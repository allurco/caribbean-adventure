import { useRef, useEffect } from "react";
import { InstancedMesh, Object3D, BoxGeometry, MeshStandardMaterial, Color, type Texture } from "three";
import { PalmTrees } from "./PalmTrees";
import { Rocks } from "./Rocks";
import { Shrubs } from "./Shrubs";
import { ShoreBoulderMeshes } from "./ShoreBoulderMeshes";
import type { DecorationLayout } from "./useDecorationLayout";

const pierGeometry = new BoxGeometry(0.15, 0.05, 0.6);

// Materials
// Fort disabled - port marker in HexGrid serves this purpose
// const fortMaterial = new MeshStandardMaterial({ color: new Color(0.75, 0.7, 0.6) });
const pierMaterial = new MeshStandardMaterial({ color: new Color(0.45, 0.35, 0.25) });

const tempObject = new Object3D();

/**
 * Trees, rocks, stones, shrubs, shore boulders and piers for one world copy,
 * from the shared `layout` (`useDecorationLayout`); `waveSlopes` light the
 * submerged boulders through the waves (ShoreBoulderMeshes).
 */
export function TerrainDecorations({ layout: decorationsByType, waveSlopes }: { layout: DecorationLayout; waveSlopes?: readonly Texture[] }) {
  const pierRef = useRef<InstancedMesh>(null!);

  // Update pier instances
  useEffect(() => {
    if (!pierRef.current || decorationsByType.piers.length === 0) return;

    const mesh = pierRef.current;
    decorationsByType.piers.forEach((pier, i) => {
      // Offset pier towards water (rotation points towards docking hex)
      // Move ~0.7 units in the direction the pier faces to position at hex edge
      const offsetX = Math.sin(pier.rotation) * 0.7;
      const offsetZ = Math.cos(pier.rotation) * 0.7;

      // Piers are at water level, offset from hex center towards water
      tempObject.position.set(pier.worldX + offsetX, 0.02, pier.worldZ + offsetZ);
      tempObject.rotation.set(0, pier.rotation, 0);
      tempObject.scale.setScalar(pier.scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [decorationsByType.piers]);

  return (
    <>
      <PalmTrees resources={decorationsByType.palms} />

      <Rocks rocks={decorationsByType.rocks} stones={decorationsByType.stones} />

      <Shrubs resources={decorationsByType.shrubs} />

      <ShoreBoulderMeshes boulders={decorationsByType.shoreBoulders} waveSlopes={waveSlopes} />

      {/* Piers */}
      {decorationsByType.piers.length > 0 && (
        <instancedMesh
          ref={pierRef}
          args={[pierGeometry, pierMaterial, decorationsByType.piers.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}
    </>
  );
}
