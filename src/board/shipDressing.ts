/**
 * Dressing one ship's copy of a merged model (#134): its owner's colour on
 * the tinted parts (the pennant, the hull stripe and the band across the
 * main course), through material copies of its own, and its flag's
 * material on the flag. Geometry and textures stay shared with every other
 * ship of the class. Pure three.js, no React.
 */
import type { Material, Mesh, MeshStandardMaterial, Object3D } from "three";

export interface ShipDress {
  /** The owner's colour, as a CSS colour. */
  readonly colour: string;
  /** The material the flag flies, shared by every ship flying that flag. */
  readonly flagMaterial: Material;
}

/**
 * Dresses `ship` (a clone of a merged model, `mergeShipModel`) and returns
 * the function that disposes the material copies it made.
 */
export function dressShipModel(ship: Object3D, { colour, flagMaterial }: ShipDress): () => void {
  const copies: Material[] = [];
  ship.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.flag) mesh.material = flagMaterial;
    else if (mesh.userData.tinted) {
      const copy = (mesh.material as MeshStandardMaterial).clone();
      copy.color.set(colour);
      copies.push(copy);
      mesh.material = copy;
    }
  });
  return () => {
    for (const copy of copies) copy.dispose();
  };
}
