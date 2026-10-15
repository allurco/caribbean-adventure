import { useFrame } from "@react-three/fiber";

/**
 * Draws the scene straight to the screen, with no post-processing (`?post=0`,
 * an A/B check on a real GPU). The scene has per-frame work at positive
 * priorities, which turns off R3F's own render, so without the
 * EffectComposer (which renders at 1) this takes its place at the same slot.
 */
export function PlainRender() {
  useFrame(({ gl, scene, camera }) => {
    gl.setRenderTarget(null);
    gl.render(scene, camera);
  }, 1);
  return null;
}
