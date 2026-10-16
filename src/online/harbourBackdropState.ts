/**
 * The harbour backdrop's phases (#122), pure:
 *
 *   still --idle--> mounting --settled--> fading --fadeEnded--> live
 *     \________________\_____________________\___________________\--failed--> failed
 *
 * - **still**: first paint, the captured still (and its inlined blur) alone.
 * - **mounting**: the shell is interactive and idle, so the lightened live
 *   scene mounts under the still, invisible, its waves held at the moment the
 *   still was captured at.
 * - **fading**: the scene has drawn a settled frame; it fades in over the
 *   still and its waves start, so the fade shows only the water starting to move.
 * - **live**: the fade is over; the still is let go.
 * - **failed**: the scene could not run (no WebGL, a lost context, an error);
 *   the still stays, for good.
 */

export type BackdropPhase = "still" | "mounting" | "fading" | "live" | "failed";

export type BackdropEvent = "idle" | "settled" | "fadeEnded" | "failed";

/** What the backdrop draws in a phase. */
export interface BackdropView {
  /** The live scene is mounted. */
  mountScene: boolean;
  /** The live scene is shown (its layer at full opacity, through a CSS fade). */
  sceneVisible: boolean;
  /** The still and its placeholder are on the page. */
  showStill: boolean;
  /** The scene's waves run (still frozen under reduced motion). */
  wavesRunning: boolean;
}

const NEXT: Readonly<Record<BackdropPhase, Partial<Record<BackdropEvent, BackdropPhase>>>> = {
  still: { idle: "mounting", failed: "failed" },
  mounting: { settled: "fading", failed: "failed" },
  fading: { fadeEnded: "live", failed: "failed" },
  live: { failed: "failed" },
  failed: {},
};

/** The phase after `event`; an event that does not apply leaves the phase as it is. */
export function nextBackdropPhase(phase: BackdropPhase, event: BackdropEvent): BackdropPhase {
  return NEXT[phase][event] ?? phase;
}

export function backdropView(phase: BackdropPhase): BackdropView {
  const mountScene = phase === "mounting" || phase === "fading" || phase === "live";
  const sceneVisible = phase === "fading" || phase === "live";
  return { mountScene, sceneVisible, showStill: phase !== "live", wavesRunning: sceneVisible };
}
