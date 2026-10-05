/**
 * The seabed prepass (#38 step 3): everything under the water surface is
 * drawn on its own layer into an offscreen colour + depth target at reduced
 * resolution, before the main pass. The water shader samples it at its own
 * pixel to see the lit seabed and how far below the surface it lies.
 */
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Color,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  UnsignedIntType,
  WebGLRenderTarget,
} from "three";

/** three.js layer for geometry the seabed prepass draws. */
export const SEABED_LAYER = 1;

/** Prepass resolution relative to the drawing buffer. */
export const SEABED_PREPASS_SCALE = 0.5;

/**
 * Runs after the camera controls (priority −1) and the scene's own per-frame
 * updates (0), and before the EffectComposer renders the frame (1), so the
 * prepass sees this frame's camera.
 */
const PREPASS_PRIORITY = 0.5;

const BLACK = new Color(0x000000);

/**
 * Render the seabed layer into a half-resolution HDR colour + depth target
 * every frame, and return it. Fog, the background and shadow-map updates are
 * switched off for the prepass: the water applies fog itself, empty pixels
 * must read as "no seabed" (depth 1), and the main pass refreshes the shadow
 * map anyway, so the prepass reuses the previous frame's.
 */
export function useSeabedPrepass(): WebGLRenderTarget {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  const target = useMemo(() => {
    const t = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthTexture: new DepthTexture(1, 1, UnsignedIntType),
    });
    t.texture.minFilter = LinearFilter;
    t.texture.magFilter = LinearFilter;
    t.texture.generateMipmaps = false;
    if (t.depthTexture) {
      t.depthTexture.minFilter = NearestFilter;
      t.depthTexture.magFilter = NearestFilter;
    }
    return t;
  }, []);
  useEffect(() => () => target.dispose(), [target]);

  useEffect(() => {
    const w = Math.max(1, Math.round(size.width * dpr * SEABED_PREPASS_SCALE));
    const h = Math.max(1, Math.round(size.height * dpr * SEABED_PREPASS_SCALE));
    target.setSize(w, h);
  }, [target, size, dpr]);

  const clearColor = useMemo(() => new Color(), []);

  useFrame(({ gl, scene, camera }) => {
    const layerMask = camera.layers.mask;
    const fog = scene.fog;
    const background = scene.background;
    const shadowAutoUpdate = gl.shadowMap.autoUpdate;
    const renderTarget = gl.getRenderTarget();
    gl.getClearColor(clearColor);
    const clearAlpha = gl.getClearAlpha();

    camera.layers.set(SEABED_LAYER);
    scene.fog = null;
    scene.background = null;
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(target);
    gl.setClearColor(BLACK, 0);
    gl.clear();
    gl.render(scene, camera);

    gl.setRenderTarget(renderTarget);
    gl.setClearColor(clearColor, clearAlpha);
    gl.shadowMap.autoUpdate = shadowAutoUpdate;
    scene.background = background;
    scene.fog = fog;
    camera.layers.mask = layerMask;
  }, PREPASS_PRIORITY);

  return target;
}
