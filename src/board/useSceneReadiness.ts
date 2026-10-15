import { useCallback, useEffect, useMemo, useReducer } from "react";
import { preloadFont } from "troika-three-text";
import { SOUNDS } from "../audio/soundRegistry";
import { audioEngine } from "../audio/sharedAudioEngine";
import { SCENE_FONTS, sceneReadinessTasks } from "./sceneAssets";
import {
  READINESS_TIMEOUT_MS,
  completeTask,
  createReadiness,
  frameRendered,
  pendingTasks,
  readinessView,
  timedOut,
  type ReadinessState,
  type ReadinessView,
} from "./sceneReadiness";

type ReadinessAction = { type: "done"; id: string } | { type: "frame" } | { type: "timeout" };

function reduce(state: ReadinessState, action: ReadinessAction): ReadinessState {
  if (action.type === "done") return completeTask(state, action.id);
  if (action.type === "frame") return frameRendered(state);
  return timedOut(state);
}

export interface SceneReadiness {
  view: ReadinessView;
  /** A readiness task finished (sceneAssets.ts names them; "shaders" for the compile). */
  complete: (id: string) => void;
  /** A frame was drawn. */
  frame: () => void;
}

/**
 * The board's loading gate (sceneReadiness.ts): loads what lives outside the
 * Canvas (web fonts, the port labels' font, the sounds' files) and takes the
 * reports of SceneReadinessProbe and the Scene for the rest. The loads start
 * at once (during the draft); READINESS_TIMEOUT_MS after `active` it logs what is still pending and lets the board show.
 */
export function useSceneReadiness(labelText: string, active: boolean): SceneReadiness {
  const [state, dispatch] = useReducer(reduce, import.meta.env.BASE_URL, (base: string) => createReadiness(sceneReadinessTasks(base)));
  const complete = useCallback((id: string) => dispatch({ type: "done", id }), []);
  const frame = useCallback(() => dispatch({ type: "frame" }), []);

  // The timeout runs from when the board is shown (`active`), not through the draft before it
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => dispatch({ type: "timeout" }), READINESS_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  // The HUD's web fonts (index.html links them)
  useEffect(() => {
    for (const font of SCENE_FONTS) {
      const [weight, ...family] = font.split(" ");
      document.fonts
        .load(`${weight} 1em "${family.join(" ")}"`)
        .then(() => complete(`font:${font}`))
        .catch((error: unknown) => console.warn(`[loading] font ${font} failed to load`, error));
    }
  }, [complete]);

  // The 3D port labels' font, for the characters they draw
  useEffect(() => {
    preloadFont({ characters: labelText || " " }, () => complete("font:labels"));
  }, [labelText, complete]);

  // Every sound's file, so the first play does not wait on the network
  useEffect(() => {
    for (const sound of SOUNDS) {
      audioEngine
        .prefetch(sound.id)
        .then(() => complete(`sound:${sound.id}`))
        .catch((error: unknown) => console.warn(`[loading] sound ${sound.id} failed to load`, error));
    }
  }, [complete]);

  const view = useMemo(() => readinessView(state), [state]);
  useEffect(() => {
    if (view.timedOut) console.warn(`[loading] showing the board after ${READINESS_TIMEOUT_MS} ms; still pending:`, pendingTasks(state));
  }, [view.timedOut, state]);

  return { view, complete, frame };
}
