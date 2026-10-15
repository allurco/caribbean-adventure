/**
 * When the board may be shown: the loading screen's stages and progress, as
 * pure state. The board is revealed only once every asset is loaded, the
 * world is built, the sky is baked, every shader is compiled and a few
 * frames have been drawn; or, so a failed asset never strands the player,
 * once the timeout has passed (sceneAssets.ts lists the assets).
 */

/** The loading stages, in the order the loading screen walks them. */
export type ReadinessStage = "models" | "fonts" | "sounds" | "world" | "sky" | "shaders" | "frames";

const STAGE_ORDER: readonly ReadinessStage[] = ["models", "fonts", "sounds", "world", "sky", "shaders", "frames"];

const STAGE_LABELS: Readonly<Record<ReadinessStage, string>> = {
  models: "Rigging the ships",
  fonts: "Inking the charts",
  sounds: "Tuning the sea",
  world: "Raising the islands",
  sky: "Lighting the sky",
  shaders: "Mixing the paints",
  frames: "Setting sail",
};

/** Frames drawn after the shaders compile before the board is shown. */
export const READINESS_FRAMES = 3;

/** How long after page load the loading screen waits before showing the board whatever is still pending. */
export const READINESS_TIMEOUT_MS = 90_000;

/** How long is left of the timeout `sincePageLoadMs` after page load (`performance.now()`). */
export function timeoutRemaining(sincePageLoadMs: number): number {
  return Math.max(0, READINESS_TIMEOUT_MS - sincePageLoadMs);
}

/** One thing the board waits on before it is shown. */
export interface ReadinessTask {
  id: string;
  stage: Exclude<ReadinessStage, "shaders" | "frames">;
}

export interface ReadinessState {
  tasks: readonly ReadinessTask[];
  /** Settled tasks: loaded, or failed and given up on. */
  done: Readonly<Record<string, "ok" | "failed">>;
  shadersCompiled: boolean;
  frames: number;
  timedOut: boolean;
}

export interface ReadinessView {
  /** The earliest stage not yet finished ("frames" once ready). */
  stage: ReadinessStage;
  /** Its label for the loading screen. */
  label: string;
  /** Share of all steps done, 0..1. */
  fraction: number;
  /** Every asset and the world are ready and the shaders still need compiling. */
  compileShaders: boolean;
  /** The board may be shown. */
  ready: boolean;
  /** Shown because the timeout passed, not because everything settled. */
  timedOut: boolean;
  /** Tasks that failed and were given up on, in task order. */
  failed: string[];
}

export function createReadiness(tasks: readonly ReadinessTask[]): ReadinessState {
  return { tasks, done: {}, shadersCompiled: false, frames: 0, timedOut: false };
}

/** Mark a task done; "shaders" marks the shader compile done. Unknown and settled ids change nothing. */
export function completeTask(state: ReadinessState, id: string): ReadinessState {
  if (id === "shaders") return state.shadersCompiled ? state : { ...state, shadersCompiled: true };
  return settle(state, id, "ok");
}

/** A task failed (a file that would not load): settled, so the gate moves on without it; listed in the view's `failed`. */
export function failTask(state: ReadinessState, id: string): ReadinessState {
  return settle(state, id, "failed");
}

function settle(state: ReadinessState, id: string, outcome: "ok" | "failed"): ReadinessState {
  if (state.done[id] || !state.tasks.some((task) => task.id === id)) return state;
  return { ...state, done: { ...state.done, [id]: outcome } };
}

/** A frame was drawn; counted only once the shaders are compiled. */
export function frameRendered(state: ReadinessState): ReadinessState {
  if (!state.shadersCompiled || state.frames >= READINESS_FRAMES) return state;
  return { ...state, frames: state.frames + 1 };
}

/** The timeout passed: show the board whatever is still pending. */
export function timedOut(state: ReadinessState): ReadinessState {
  return state.timedOut ? state : { ...state, timedOut: true };
}

/** The ids still pending, in task order, then "shaders" and "frames". */
export function pendingTasks(state: ReadinessState): string[] {
  const pending = state.tasks.filter((task) => !state.done[task.id]).map((task) => task.id);
  if (!state.shadersCompiled) pending.push("shaders");
  if (state.frames < READINESS_FRAMES) pending.push("frames");
  return pending;
}

export function readinessView(state: ReadinessState): ReadinessView {
  const assetsDone = state.tasks.every((task) => state.done[task.id]);
  const loaded = state.tasks.filter((task) => state.done[task.id]).length;
  const steps = state.tasks.length + 1 + READINESS_FRAMES;
  const doneSteps = loaded + (state.shadersCompiled ? 1 : 0) + state.frames;
  const complete = assetsDone && state.shadersCompiled && state.frames >= READINESS_FRAMES;
  const stage =
    STAGE_ORDER.find((s) =>
      s === "shaders" ? !state.shadersCompiled : s === "frames" ? true : state.tasks.some((t) => t.stage === s && !state.done[t.id])
    ) ?? "frames";
  return {
    stage,
    label: STAGE_LABELS[stage],
    fraction: doneSteps / steps,
    compileShaders: assetsDone && !state.shadersCompiled && !state.timedOut,
    ready: complete || state.timedOut,
    timedOut: state.timedOut && !complete,
    failed: state.tasks.filter((task) => state.done[task.id] === "failed").map((task) => task.id),
  };
}
