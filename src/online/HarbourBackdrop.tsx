import { lazy, Suspense, useCallback, useEffect, useReducer, type TransitionEvent } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { backdropView, nextBackdropPhase, type BackdropPhase } from "./harbourBackdropState";
import { HarbourStill } from "./HarbourStill";
import { whenIdle, type IdleHost } from "./whenIdle";

// The live scene is its own chunk, fetched only once the shell is idle.
const HarbourScene = lazy(() => import("../board/harbour/HarbourScene").then((m) => ({ default: m.HarbourScene })));

/**
 * The harbour behind the whole shell (#122, the backdrop of #104's "Harbour
 * launcher"), built to load well (harbourBackdropState.ts):
 *
 * 1. First paint: the still captured from the live scene's fixed camera,
 *    over its inlined blurred copy (HarbourStill). The app shows this same
 *    backdrop while the shell's chunk loads, so it is the very first frame.
 * 2. Once the shell is `interactive` and the page idle, the lightened live
 *    scene mounts under the still, invisible, its waves held at the still's
 *    moment.
 * 3. When it reports a settled frame (never on a timer) it fades in over
 *    the still and its waves start: the same framing, so the fade shows only
 *    the water starting to move. The still is let go once the fade is over.
 *    If the scene cannot run, the still stays.
 *
 * The shell mounts this once, at the same place in the tree on every screen,
 * and swaps only the sheet, so the scene survives screen changes without
 * remounting. The phase is on `<html data-harbour>`, and each one a
 * performance mark (`harbour:<phase>`), for timing and browser checks.
 */
export function HarbourBackdrop({ interactive }: { interactive: boolean }) {
  const [phase, dispatch] = useReducer(nextBackdropPhase, "still");
  const view = backdropView(phase);

  useEffect(() => {
    if (!interactive) return;
    return whenIdle(windowIdleHost(), () => dispatch("idle"));
  }, [interactive]);

  useEffect(() => markPhase(phase), [phase]);

  const onSettled = useCallback(() => dispatch("settled"), []);
  const onFailed = useCallback((error: unknown) => {
    console.warn("[harbour] the live scene cannot run; keeping the still", error);
    dispatch("failed");
  }, []);
  const onFadeEnd = (event: TransitionEvent) => {
    if (event.target === event.currentTarget) dispatch("fadeEnded");
  };

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-shell-harbour">
      {view.showStill && <HarbourStill />}
      {view.mountScene && (
        <div
          onTransitionEnd={onFadeEnd}
          className={`absolute inset-0 transition-opacity duration-[1200ms] ease-out ${view.sceneVisible ? "opacity-100" : "opacity-0"}`}
        >
          <ErrorBoundary fallback={null} onError={onFailed}>
            <Suspense fallback={null}>
              <HarbourScene wavesRunning={view.wavesRunning} onSettled={onSettled} onFailed={onFailed} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {/* a soft vignette so the boards read over bright water */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_45%_50%,transparent_45%,rgba(5,12,18,0.55))]" />
    </div>
  );
}

/** The window's idle callback and timers, bound (they throw when called off `window`). */
function windowIdleHost(): IdleHost {
  return {
    ...(typeof window.requestIdleCallback === "function"
      ? {
          requestIdleCallback: (callback, options) => window.requestIdleCallback(callback, options),
          cancelIdleCallback: (id) => window.cancelIdleCallback(id),
        }
      : {}),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (id) => window.clearTimeout(id),
  };
}

function markPhase(phase: BackdropPhase): void {
  document.documentElement.dataset.harbour = phase;
  performance.mark(`harbour:${phase}`);
}
