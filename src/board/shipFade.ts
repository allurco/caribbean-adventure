/**
 * Fading one sinking ship's model out (#135). Every part of the ship is drawn
 * through a material of its own, so the fade never touches another ship of
 * the class: the copies the dressing already made for her (her colour, her
 * wind, `shipDressing.ts`) fade in place, and each material she still shares
 * (the hull, the deck, a flag with no wind) is copied for her alone. Geometry
 * and textures stay shared. Disposing puts the shared materials back and
 * disposes only the copies made here; the dressing disposes its own. She
 * stays opaque, on the same shader programs as every ship afloat, until her
 * opacity first drops below 1. Pure three.js, no React.
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
    faded.push(material);
  });
  let disposed = false;
  // Opaque until she starts to fade: going transparent changes the shader's
  // defines, so it is done once, as the fade begins (the variants are warmed
  // at load, `retainFadeVariants`), never for a ship that does not fade.
  let transparent = false;
  return {
    setOpacity(opacity) {
      const fading = opacity < 1;
      if (fading !== transparent) {
        transparent = fading;
        for (const material of faded) {
          material.transparent = fading;
          material.needsUpdate = true;
        }
      }
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
