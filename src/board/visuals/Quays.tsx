import { useEffect, useRef } from "react";
import { BufferAttribute, BufferGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { paletteColor, type PaletteName } from "./palette";
import type { Rgb } from "./palmGeometry";
import { buildQuayGeometry, type QuayColors } from "./quayGeometry";
import type { QuayPlacement } from "./quayPlacement";
import { SEABED_LAYER } from "./seabedPrepass";

const rgb = (name: PaletteName): Rgb => {
  const c = paletteColor(name);
  return [c.r, c.g, c.b];
};

/**
 * The quay's palette (`propEntries.ts` mirrors it): the watchtower's masonry
 * pulled darker and warmer (weathered stone with an ochre cast, well below
 * the sand), near-black mortar, the pier's timber, iron, hemp rope and the
 * beach sand that drifts over the landward paving.
 */
function quayColors(): QuayColors {
  const masonry = rgb("masonry");
  const stone: [number, number, number] = [masonry[0] * 0.95, masonry[1] * 0.86, masonry[2] * 0.72];
  return {
    stone,
    mortar: [stone[0] * 0.28, stone[1] * 0.26, stone[2] * 0.24],
    timber: rgb("timber"),
    iron: [0.045, 0.04, 0.038],
    rope: [0.42, 0.34, 0.22],
    sand: rgb("drySand"),
  };
}

/** One quay's triangles, shared by every instance. */
const QUAY_GEOMETRY = (() => {
  const data = buildQuayGeometry(quayColors());
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(data.colors, 3));
  return geometry;
})();

// White with vertex colours: the stone, coping and bollards carry their own colour.
const QUAY_MATERIAL = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0 });

const tempObject = new Object3D();

/**
 * Every port's quay in one instanced draw (per world copy), at the pier's
 * root and turned with it (`quayPlacement.ts`). Each instance is scaled
 * across and along the pier for its port's width and depth; the spread is
 * small, so the normals stay near enough true under the non-uniform
 * scale. Drawn in the seabed prepass as well, so the sea wall shows
 * through the shallows as the pier posts do.
 */
export function Quays({ quays }: { quays: readonly QuayPlacement[] }) {
  const meshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.layers.enable(SEABED_LAYER);
    quays.forEach((quay, i) => {
      tempObject.position.set(quay.worldX, quay.worldY, quay.worldZ);
      tempObject.rotation.set(0, quay.yaw, 0);
      tempObject.scale.set(quay.scaleX, 1, quay.scaleZ);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [quays]);

  if (quays.length === 0) return null;

  return (
    <instancedMesh
      // Remount when the count changes: an InstancedMesh's capacity is fixed.
      key={quays.length}
      ref={meshRef}
      args={[QUAY_GEOMETRY, QUAY_MATERIAL, quays.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}
