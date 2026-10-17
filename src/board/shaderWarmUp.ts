/**
 * Compiling the scene's shaders at load as the frames will draw them (#135).
 * three builds a material's program for the target it is drawn into: to the
 * screen in the renderer's output colour space and tone mapping, into a
 * render target in linear colour, untone-mapped. The board draws its frames
 * through the post-processing composer's render targets, so a compile run
 * against the screen builds variants no frame uses, and each material then
 * compiles again on its first draw. Ships kept out of sight (the fading
 * keepers in `SceneReadinessProbe.tsx`) are never drawn, so only a compile
 * into a target warms what they will draw. Pure, no three.js import.
 */
import type { RenderOff } from "./devUrlParams";

/** Where the frames are drawn: through the composer's render targets, or straight to the screen. */
export type FrameOutput = "composer" | "screen";

/** Where the board draws its frames: the one decision the board's passes and its shader warm-up both follow. */
export const frameOutputFor = (renderOff: RenderOff): FrameOutput => (renderOff.postProcessing ? "screen" : "composer");

/** The part of a renderer that switches its render target. */
export interface RenderTargetSwitch<Target> {
  getRenderTarget(): Target | null;
  setRenderTarget(target: Target | null): void;
}

/**
 * Runs `compile` (a renderer's `compileAsync` over the scene) against the
 * target the frames go to: for the composer, a render target made by
 * `createTarget`, set only while the compile queues its programs (three picks
 * each program's variant then, synchronously), then put back and disposed.
 * Never throws: anything that throws, making the target or compiling, comes
 * back as a rejected promise, so the loading gate hears of it at once.
 */
export function compileForFrames<Target, Made extends Target & { dispose(): void }>(
  renderer: RenderTargetSwitch<Target>,
  compile: () => Promise<unknown>,
  output: FrameOutput,
  createTarget: () => Made
): Promise<unknown> {
  if (output === "screen") return run(compile);
  return run(() => {
    const target = createTarget();
    try {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      try {
        return compile();
      } finally {
        renderer.setRenderTarget(previous);
      }
    } finally {
      target.dispose();
    }
  });
}

const run = (compile: () => Promise<unknown>): Promise<unknown> => {
  try {
    return compile();
  } catch (error) {
    return Promise.reject(error);
  }
};
