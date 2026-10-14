/**
 * Dressing one ship's copy of a merged model (#134): its owner's colour on
 * the tinted parts (the pennant, the hull stripe and the band across the
 * main course), through material copies of its own, and its flag's
 * material on the flag. With a wind (#204), the canvas, the flag and the
 * pennant move in it, through the ship's own patched copies and the shadow
 * depth to match. Geometry and textures stay shared with every other ship
 * of the class. Pure three.js, no React.
 */
import type { Material, Mesh, MeshStandardMaterial, Object3D } from "three";
import type { ShipWindUniforms } from "./shipWind";
import { blowShipWind, shipWindDepthMaterial } from "./shipWindMaterial";

export interface ShipDress {
  /** The owner's colour, as a CSS colour. */
  readonly colour: string;
  /** The material the flag flies, shared by every ship flying that flag. */
  readonly flagMaterial: Material;
  /** The ship's own wind uniforms (`shipWind.ts`): its canvas and cloth move in them. */
  readonly wind?: ShipWindUniforms;
}

/**
 * Dresses `ship` (a clone of a merged model, `mergeShipModel`) and returns
 * the function that disposes the material copies it made and puts the
 * loaded canvas back.
 */
export function dressShipModel(ship: Object3D, { colour, flagMaterial, wind }: ShipDress): () => void {
  const copies: Material[] = [];
  const restores: (() => void)[] = [];
  ship.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const loaded = mesh.material as Material;
    let ours = false;
    if (mesh.userData.flag) mesh.material = flagMaterial;
    else if (mesh.userData.tinted) {
      const copy = (loaded as MeshStandardMaterial).clone();
      copy.color.set(colour);
      copies.push(copy);
      mesh.material = copy;
      ours = true;
    }
    if (!wind || !mesh.userData.wind) return;
    if (!ours) {
      const copy = (mesh.material as Material).clone();
      copies.push(copy);
      mesh.material = copy;
    }
    blowShipWind(mesh.material as Material, wind);
    const depth = shipWindDepthMaterial(wind);
    copies.push(depth);
    mesh.customDepthMaterial = depth;
    restores.push(() => {
      if (!mesh.userData.flag && !mesh.userData.tinted) mesh.material = loaded;
      mesh.customDepthMaterial = undefined;
    });
  });
  return () => {
    for (const restore of restores) restore();
    for (const copy of copies) copy.dispose();
  };
}
