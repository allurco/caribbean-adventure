import { useSyncExternalStore } from "react";
import { NO_INSETS, type SafeAreaEdge, type SafeAreaInsets } from "./safeArea";

const EDGES: readonly SafeAreaEdge[] = ["top", "right", "bottom", "left"];

let probe: HTMLDivElement | null = null;
let last: SafeAreaInsets = NO_INSETS;

/** A hidden element padded by the four insets: script cannot read `env()` directly, but it can read a computed padding. */
function probeElement(): HTMLDivElement {
  if (probe) return probe;
  probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;";
  for (const edge of EDGES) probe.style.setProperty(`padding-${edge}`, `env(safe-area-inset-${edge}, 0px)`);
  document.body.appendChild(probe);
  return probe;
}

function read(): SafeAreaInsets {
  const style = getComputedStyle(probeElement());
  const next = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  // The same object while nothing changed, as useSyncExternalStore needs
  if (EDGES.some((edge) => next[edge] !== last[edge])) last = next;
  return last;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

/**
 * The screen's safe-area insets in CSS pixels (#123), kept current as the
 * phone turns: for placements worked out in script, like the harbour link's.
 * Pieces placed in CSS use `safeInset` instead.
 */
export function useSafeAreaInsets(): SafeAreaInsets {
  return useSyncExternalStore(subscribe, read, () => NO_INSETS);
}
