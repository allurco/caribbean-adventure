import { useEffect, useRef } from "react";
import { InstancedMesh, Object3D } from "three";
import { palmVariation } from "./palmVariation";
import type { PalmTreesResources } from "./usePalmTrees";

const tempObject = new Object3D();
tempObject.rotation.order = "YXZ"; // Lean in local space first, then yaw

/** Every palm on the map in one instanced draw (per world copy), swaying in the vertex shader. */
export function PalmTrees({ resources }: { resources: PalmTreesResources }) {
  const { palms, geometry, material, depthMaterial } = resources;
  const meshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    palms.forEach((palm, i) => {
      const v = palmVariation(palm);
      tempObject.position.set(palm.worldX, palm.worldY, palm.worldZ);
      // The trunk curves towards local +X; a negative Z turn tips it further that way.
      tempObject.rotation.set(0, v.yaw, -v.lean);
      tempObject.scale.set(palm.scale, palm.scale * v.heightScale, palm.scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [palms]);

  if (palms.length === 0) return null;

  return (
    <instancedMesh
      // Remount when the count changes: an InstancedMesh's capacity is fixed.
      key={palms.length}
      ref={meshRef}
      args={[geometry, material, palms.length]}
      customDepthMaterial={depthMaterial}
      castShadow
      // No receiveShadow: the thin double-sided fronds shadow themselves into acne.
      frustumCulled={false}
    />
  );
}
