/**
 * A ship's canvas, flag and pennant materials in its wind (#204): each
 * patched with `injectShipWind` on its own uniforms, and a matching depth
 * material so its shadow moves with it. The patch's source is the same for
 * every ship, so three.js compiles it once per material kind and shares the
 * program: the copies cost no extra programs and no extra draws.
 */
import { MeshDepthMaterial, type Material } from "three";
import { injectShipWind, type ShipWindUniforms } from "./shipWind";

/** Patches `material` in place to move in the wind `uniforms` carry. */
export function blowShipWind(material: Material, uniforms: ShipWindUniforms): void {
  material.onBeforeCompile = (shader) => {
    injectShipWind(shader, uniforms);
  };
  material.needsUpdate = true;
}

/** The depth material a ship's cloth casts its shadow with, moving as the cloth does. */
export function shipWindDepthMaterial(uniforms: ShipWindUniforms): MeshDepthMaterial {
  const depth = new MeshDepthMaterial();
  blowShipWind(depth, uniforms);
  return depth;
}
