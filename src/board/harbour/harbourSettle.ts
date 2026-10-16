/**
 * When the harbour backdrop's live scene has drawn a settled frame (#122),
 * the signal its fade waits on, pure. Like the board's loading gate
 * (sceneReadiness.ts), but for one scene with no assets to fetch: the world
 * built, the sky baked (the sea waits on it), every shader compiled, then a
 * run of frames drawn, so nothing is still compiling or popping in when the
 * scene shows.
 */

export type SettleEvent = "world" | "sky" | "compiled" | "frame";

export interface SettleState {
  world: boolean;
  sky: boolean;
  compiled: boolean;
  /** Frames drawn since the shaders were compiled. */
  frames: number;
}

/** Frames drawn after the compile before the scene counts as settled: the wave cascades and the seabed prepass compile on their first draw. */
export const HARBOUR_SETTLE_FRAMES = 4;

export const UNSETTLED: SettleState = { world: false, sky: false, compiled: false, frames: 0 };

export function settleStep(state: SettleState, event: SettleEvent): SettleState {
  switch (event) {
    case "world":
      return { ...state, world: true };
    case "sky":
      return { ...state, sky: true };
    case "compiled":
      return { ...state, compiled: true };
    case "frame":
      return state.compiled && state.frames < HARBOUR_SETTLE_FRAMES ? { ...state, frames: state.frames + 1 } : state;
  }
}

/** Whether to compile the scene's shaders now: the world and the sky are in, and they are not compiled yet. */
export function shouldCompile(state: SettleState): boolean {
  return state.world && state.sky && !state.compiled;
}

export function isSettled(state: SettleState): boolean {
  return state.compiled && state.frames >= HARBOUR_SETTLE_FRAMES;
}
