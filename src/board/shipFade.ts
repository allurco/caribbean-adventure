/**
 * Fading one sinking ship's model out (#135). Every part of the ship is drawn
 * through a material of its own, so the fade never touches another ship of
 * the class: the copies the dressing already made for her (her colour, her
 * wind, `shipDressing.ts`) fade in place, and each material she still shares
 * (the hull, the deck, a flag with no wind) is copied for her alone. Geometry
 * and textures stay shared. Disposing puts the shared materials back and
 * disposes only the copies made here; the dressing disposes its own. Pure
 * three.js, no React.
 */
import type { Material, Mesh, Object3D } from "three";
import { isShipOwnMaterial } from "./shipDressing";

export interface ShipFade {
  /** Sets every part of the ship to `opacity` (1 afloat, 0 gone). */
  setOpacity(opacity: number): void;
  /** Puts the shared materials back and disposes the copies made for the fade. Safe to call twice. */
  dispose(): void;
}

/** Makes `ship` (a dressed copy of a merged model) fadeable; call after dressing it, and dispose before undressing it. */
export function fadeShipModel(ship: Object3D): ShipFade {
  const faded: Material[] = [];
  const copies: Material[] = [];
  const restores: (() => void)[] = [];
  ship.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const current = mesh.material as Material;
    let material = current;
    if (!isShipOwnMaterial(current)) {
      material = current.clone();
      copies.push(material);
      mesh.material = material;
      restores.push(() => {
        mesh.material = current;
      });
    }
    material.transparent = true;
    material.opacity = 1;
    material.needsUpdate = true;
    faded.push(material);
  });
  let disposed = false;
  return {
    setOpacity(opacity) {
      for (const material of faded) material.opacity = opacity;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const restore of restores) restore();
      for (const copy of copies) copy.dispose();
    },
  };
}
