import { useCallback, useEffect, useMemo, useReducer } from "react";
import { preloadFont } from "troika-three-text";
import { SOUNDS } from "../audio/soundRegistry";
import { audioEngine } from "../audio/sharedAudioEngine";
import { SCENE_FONTS, sceneReadinessTasks } from "./sceneAssets";
import { eventCardArtUrls } from "./cardArtSlots";
import { preloadCardArt } from "./cardArtCache";
import {
  READINESS_TIMEOUT_MS,
  completeTask,
  createReadiness,
  failTask,
  frameRendered,
  pendingTasks,
  readinessView,
  timedOut,
  timeoutRemaining,
  type ReadinessState,
  type ReadinessView,
} from "./sceneReadiness";

type ReadinessAction = { type: "done"; id: string } | { type: "failed"; id: string } | { type: "frame" } | { type: "timeout" };

function reduce(state: ReadinessState, action: ReadinessAction): ReadinessState {
  if (action.type === "done") return completeTask(state, action.id);
  if (action.type === "failed") return failTask(state, action.id);
  if (action.type === "frame") return frameRendered(state);
  return timedOut(state);
}

export interface SceneReadiness {
  view: ReadinessView;
  /** A readiness task finished (sceneAssets.ts names them; "shaders" for the compile). */
  complete: (id: string) => void;
  /** A readiness task failed: logged, and settled so the gate moves on without it. */
  fail: (id: string, error: unknown) => void;
  /** A frame was drawn. */
  frame: () => void;
}

/**
 * The board's loading gate (sceneReadiness.ts): loads what lives outside the
 * Canvas (web fonts, the port labels' font, the sounds' files, the event
 * cards' art) and takes the
 * reports of SceneReadinessProbe and the Scene for the rest. The loads start
 * at once; READINESS_TIMEOUT_MS after page load it logs what is still pending and lets the board show.
 */
export function useSceneReadiness(labelText: string): SceneReadiness {
  const [state, dispatch] = useReducer(reduce, import.meta.env.BASE_URL, (base: string) => createReadiness(sceneReadinessTasks(base)));
  const complete = useCallback((id: string) => dispatch({ type: "done", id }), []);
  const fail = useCallback((id: string, error: unknown) => {
    console.warn(`[loading] ${id} failed to load; going on without it`, error);
    dispatch({ type: "failed", id });
  }, []);
  const frame = useCallback(() => dispatch({ type: "frame" }), []);

  // The timeout runs from page load (performance.now() counts from it), map generation included
  useEffect(() => {
    const timer = window.setTimeout(() => dispatch({ type: "timeout" }), timeoutRemaining(performance.now()));
    return () => window.clearTimeout(timer);
  }, []);

  // The HUD's web fonts (index.html links them)
  useEffect(() => {
    for (const font of SCENE_FONTS) {
      const [weight, ...family] = font.split(" ");
      document.fonts
        .load(`${weight} 1em "${family.join(" ")}"`)
        .then(() => complete(`font:${font}`))
        .catch((error: unknown) => fail(`font:${font}`, error));
    }
  }, [complete, fail]);

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
        .catch((error: unknown) => fail(`sound:${sound.id}`, error));
    }
  }, [complete, fail]);

  // Every event card's art (#247), decoded and kept (cardArtCache.ts), so a card's picture is there when it shows
  useEffect(() => {
    for (const url of eventCardArtUrls(import.meta.env.BASE_URL)) {
      preloadCardArt(url)
        .then(() => complete(`card:${url}`))
        .catch((error: unknown) => fail(`card:${url}`, error));
    }
  }, [complete, fail]);

  const view = useMemo(() => readinessView(state), [state]);
  useEffect(() => {
    if (view.timedOut) console.warn(`[loading] showing the board after ${READINESS_TIMEOUT_MS} ms; still pending:`, pendingTasks(state));
  }, [view.timedOut, state]);

  return { view, complete, fail, frame };
}
