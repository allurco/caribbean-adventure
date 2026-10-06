import { useEffect, useRef } from "react";
import { BufferGeometry, Color, InstancedMesh, MeshDepthMaterial, MeshStandardMaterial, Object3D } from "three";
import { shrubVariation, type ShrubPlacement } from "./shrubVariation";
import type { ShrubsResources } from "./useShrubs";

const tempObject = new Object3D();
const tempColor = new Color();

interface ShrubKindMeshProps {
  shrubs: readonly ShrubPlacement[];
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  depthMaterial: MeshDepthMaterial;
}

/** Every shrub of one kind in one instanced draw, tinted per instance and swaying in the vertex shader. */
function ShrubKindMesh({ shrubs, geometry, material, depthMaterial }: ShrubKindMeshProps) {
  const meshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    shrubs.forEach((shrub, i) => {
      const v = shrubVariation(shrub);
      tempObject.position.set(shrub.worldX, shrub.worldY, shrub.worldZ);
      tempObject.rotation.set(0, v.yaw, 0);
      tempObject.scale.set(v.scale[0], v.scale[1], v.scale[2]);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
      // Linear multipliers on the vertex colours (setRGB takes the working colour space).
      mesh.setColorAt(i, tempColor.setRGB(v.tint[0], v.tint[1], v.tint[2]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [shrubs]);

  if (shrubs.length === 0) return null;

  return (
    <instancedMesh
      // Remount when the count changes: an InstancedMesh's capacity is fixed.
      key={shrubs.length}
      ref={meshRef}
      args={[geometry, material, shrubs.length]}
      customDepthMaterial={depthMaterial}
      castShadow
      // No receiveShadow, as for the palms: thin double-sided blades shadow themselves into acne.
      frustumCulled={false}
    />
  );
}

/** Every bush and tuft on the map, one instanced draw per kind (per world copy). */
export function Shrubs({ resources }: { resources: ShrubsResources }) {
  const { kinds, material, depthMaterial } = resources;
  return (
    <>
      {kinds.map((k) => (
        <ShrubKindMesh key={k.kind} shrubs={k.shrubs} geometry={k.geometry} material={material} depthMaterial={depthMaterial} />
      ))}
    </>
  );
}
