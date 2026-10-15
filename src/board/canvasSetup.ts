import type { GpuCheck, RenderOff } from "./devUrlParams";

/**
 * The canvas's pixel ratio: the device's, capped at 1.5. At 2 on a Retina
 * screen the drawing buffer, its multisampled copy and the composer's HDR
 * buffers come to about 370 MB of GPU memory at 1440 × 900; at 1.5 about 210 MB,
 * for a picture hardly softer (the post-processing smooths it).
 */
export const CANVAS_DPR: [number, number] = [1, 1.5];
/** The composer's multisampling, @react-three/postprocessing's default. */
export const COMPOSER_MULTISAMPLING = 8;

/** What the board's Canvas and EffectComposer are set up with. */
export interface CanvasSetup {
  dpr: number | [number, number];
  gl: { antialias: boolean; powerPreference: WebGLPowerPreference; preserveDrawingBuffer: boolean };
  shadows: boolean;
  composerMultisampling: number;
}

/** The canvas and composer for the A/B switches (`?dpr=1`, `?power=low`, `?pdb=1`, `?aa=0`, `?shadows=0`); the game's usual set-up without them. Pure. */
export function canvasSetup(gpu: GpuCheck, off: RenderOff): CanvasSetup {
  return {
    dpr: gpu.dpr1 ? 1 : CANVAS_DPR,
    gl: {
      antialias: !off.msaa,
      powerPreference: gpu.lowPower ? "low-power" : "high-performance",
      preserveDrawingBuffer: gpu.preserveDrawingBuffer === true,
    },
    shadows: !off.shadows,
    composerMultisampling: off.msaa ? 0 : COMPOSER_MULTISAMPLING,
  };
}
