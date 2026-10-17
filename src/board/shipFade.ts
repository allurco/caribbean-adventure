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

/**
 * Draws `material` at `opacity`: transparent only while it fades (below 1),
 * or always if it was transparent afloat (`transparentAfloat`), and not at
 * all once it has faded out. Going transparent changes the shader's defines,
 * so the material asks for a recompile only when that changes, never on each
 * opacity; the programs are warmed at load (`SceneReadinessProbe.tsx`), so
 * the recompile finds them ready. The model's fade and the box's share it.
 */
export function setMaterialFade(material: Material, opacity: number, transparentAfloat = false): void {
  const transparent = transparentAfloat || opacity < 1;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  material.opacity = opacity;
  material.visible = opacity > 0;
}

/** Makes `ship` (a dressed copy of a merged model) fadeable; call after dressing it, and dispose before undressing it. */
export function fadeShipModel(ship: Object3D): ShipFade {
  const faded: { material: Material; transparentAfloat: boolean }[] = [];
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
    faded.push({ material, transparentAfloat: material.transparent });
  });
  let disposed = false;
  return {
    setOpacity(opacity) {
      for (const { material, transparentAfloat } of faded) setMaterialFade(material, opacity, transparentAfloat);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const restore of restores) restore();
      for (const copy of copies) copy.dispose();
    },
  };
}
