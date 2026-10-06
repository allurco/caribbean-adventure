import { useEffect, useRef } from "react";
import { BufferGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import type { RockVariation } from "./rockVariation";

const tempObject = new Object3D();
tempObject.rotation.order = "YXZ"; // Tilt in local space first, then yaw
const tempColor = new Color();

/** A rock to draw: where it stands and how it varies. */
export interface RockInstance {
  worldX: number;
  worldY: number;
  worldZ: number;
  variation: RockVariation;
}

interface RockVariantMeshProps {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  rocks: readonly RockInstance[];
}

/** Every rock of one faceted variant in one instanced draw, tinted per instance. */
export function RockVariantMesh({ geometry, material, rocks }: RockVariantMeshProps) {
  const meshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    rocks.forEach((rock, i) => {
      const v = rock.variation;
      // The ground contact is the mesh origin; the bury depth sinks it a little further.
      tempObject.position.set(rock.worldX, rock.worldY - v.bury * v.scale[1], rock.worldZ);
      tempObject.rotation.set(v.tilt[0], v.yaw, v.tilt[1]);
      tempObject.scale.set(v.scale[0], v.scale[1], v.scale[2]);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
      // setHex reads sRGB and converts to the linear working space; the tint scales it there.
      mesh.setColorAt(i, tempColor.setHex(v.baseColor).multiplyScalar(v.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [rocks]);

  if (rocks.length === 0) return null;

  return (
    <instancedMesh
      // Remount when the count changes: an InstancedMesh's capacity is fixed.
      key={rocks.length}
      ref={meshRef}
      args={[geometry, material, rocks.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}
