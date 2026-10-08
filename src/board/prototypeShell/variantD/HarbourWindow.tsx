import { Suspense, lazy, useEffect, useState } from "react";
import { usePrefersReducedMotion } from "../../usePrefersReducedMotion";
import { HARBOUR_STILL_LQIP } from "./harbourStillLqip";

/**
 * THROWAWAY PROTOTYPE — variant D's backdrop: the harbour behind the whole
 * shell, built so the shell looks finished at first paint.
 *
 * 1. First paint: a tiny inline blur-up of the harbour still, then the still
 *    itself (public/prototype-shell/harbour-still.jpg), a frame of the live
 *    scene captured from the same fixed camera. Both are sized like the
 *    perspective camera (fit to height, centred), so they line up with the
 *    live scene at any viewport width up to the still's 2.6:1.
 * 2. After the shell is interactive (idle callback), the cut-down live scene
 *    mounts underneath, invisible (LiteHarbour: fixed camera, DPR 1, no
 *    shadows or postprocessing, 30 fps on demand).
 * 3. Only when it reports a settled frame does it fade in over the still.
 *    Same framing, so the fade shows the water starting to move, not a swap.
 *
 * It sits at the same place in the tree on every screen, so switching
 * screens never remounts or rebuilds it. `?backdrop=still` keeps the still
 * (review the first-paint state); `?backdrop=capture` shows only the live
 * scene, full screen, to re-capture the still.
 */

const LiteHarbour = lazy(() => import("./LiteHarbour").then((m) => ({ default: m.LiteHarbour })));

const HARBOUR_STILL_URL = "/prototype-shell/harbour-still.jpg";
const IDLE_TIMEOUT_MS = 1500;

type Mode = "live" | "still" | "capture";

function readMode(): Mode {
  const b = new URLSearchParams(window.location.search).get("backdrop");
  return b === "still" || b === "capture" ? b : "live";
}

function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(fn, 300);
  return () => globalThis.clearTimeout(id);
}

const STILL_LAYER = "absolute inset-0 bg-no-repeat bg-center bg-[length:auto_100%]";

export function HarbourWindow() {
  const [mode] = useState(readMode);
  const reducedMotion = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(mode === "capture");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (mode !== "live") return;
    return whenIdle(() => {
      performance.mark("harbour-mount");
      setMounted(true);
    });
  }, [mode]);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.harbourReady = "true";
    performance.mark("harbour-ready");
  }, [ready]);

  if (mode === "capture") {
    return (
      <div className="fixed inset-0 z-[2000] bg-[#082633]">
        <Suspense fallback={null}>
          <LiteHarbour onReady={() => setReady(true)} />
        </Suspense>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-[#1d5f86]">
      <div className={`${STILL_LAYER} blur-xl scale-105`} style={{ backgroundImage: `url(${HARBOUR_STILL_LQIP})` }} />
      <div className={STILL_LAYER} style={{ backgroundImage: `url(${HARBOUR_STILL_URL})` }} />
      {mounted && (
        <div className={`absolute inset-0 ${ready ? "opacity-100" : "opacity-0"} ${reducedMotion ? "" : "transition-opacity duration-[1200ms] ease-out"}`}>
          <Suspense fallback={null}>
            <LiteHarbour onReady={() => setReady(true)} />
          </Suspense>
        </div>
      )}
      {/* a soft vignette so the boards read over bright water */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_45%_50%,transparent_45%,rgba(5,12,18,0.55))]" />
    </div>
  );
}
