import { Suspense, useCallback } from "react";
import { HarbourScene } from "./HarbourScene";
import { harbourViewRecord } from "./harbourView";

/**
 * Dev `?view=harbour` (#122): the harbour scene alone, full screen, its
 * motion held, for scripts/capture-harbour-still.mjs to capture
 * the still from. It marks the page `data-harbour="settled"` once the scene
 * has drawn a settled frame, and `data-harbour-view` with the view it shows,
 * which the script records with the still.
 */
export default function HarbourCapture() {
  const onSettled = useCallback(() => {
    document.documentElement.dataset.harbourView = JSON.stringify(harbourViewRecord());
    document.documentElement.dataset.harbour = "settled";
  }, []);
  const onFailed = useCallback((error: unknown) => {
    console.error("[harbour] the scene failed", error);
    document.documentElement.dataset.harbour = "failed";
  }, []);
  return (
    <div className="fixed inset-0 bg-shell-harbour">
      <Suspense fallback={null}>
        <HarbourScene onSettled={onSettled} onFailed={onFailed} />
      </Suspense>
    </div>
  );
}
