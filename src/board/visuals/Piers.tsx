import { useEffect, useRef } from "react";
import { BufferAttribute, BufferGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { paletteColor } from "./palette";
import type { Rgb } from "./palmGeometry";
import { buildPierGeometry } from "./pierGeometry";
import { SEABED_LAYER } from "./seabedPrepass";
import type { DecorationData } from "./useDecorationLayout";

const rgb = (name: "timber"): Rgb => {
  const c = paletteColor(name);
  return [c.r, c.g, c.b];
};

/** One plank pier's triangles, shared by every instance: posts in timber, planks a sun-bleached shade of it. */
const PIER_GEOMETRY = (() => {
  const timber = rgb("timber");
  const data = buildPierGeometry({ plank: [timber[0] * 1.6, timber[1] * 1.6, timber[2] * 1.6], post: timber });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(data.colors, 3));
  return geometry;
})();

// White with vertex colours: the planks and posts carry their own colour.
const PIER_MATERIAL = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 });

const tempObject = new Object3D();

/**
 * Every pier on the map in one instanced draw (per world copy). The layout
 * puts each pier's origin (its land end) where the beach meets the water at
 * sea level, turned towards the docking hex. Drawn in the seabed prepass as
 * well, so the posts show through the shallows.
 */
export function Piers({ piers }: { piers: readonly DecorationData[] }) {
  const meshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.layers.enable(SEABED_LAYER);
    piers.forEach((pier, i) => {
      tempObject.position.set(pier.worldX, pier.worldY, pier.worldZ);
      tempObject.rotation.set(0, pier.rotation, 0);
      tempObject.scale.setScalar(pier.scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [piers]);

  if (piers.length === 0) return null;

  return (
    <instancedMesh
      // Remount when the count changes: an InstancedMesh's capacity is fixed.
      key={piers.length}
      ref={meshRef}
      args={[PIER_GEOMETRY, PIER_MATERIAL, piers.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}
