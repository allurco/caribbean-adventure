import { useSyncExternalStore } from "react";
import { onViewportChange } from "./onViewportChange";
import { NO_INSETS, type SafeAreaEdge, type SafeAreaInsets } from "./safeArea";

const EDGES: readonly SafeAreaEdge[] = ["top", "right", "bottom", "left"];

/**
 * A hidden element padded by the four insets: script cannot read `env()`
 * directly, but it can read a computed padding. It goes into the page when
 * the first reader subscribes, never during a render, and out when the last
 * one leaves.
 */
let probe: HTMLDivElement | null = null;
let readers = 0;
let last: SafeAreaInsets = NO_INSETS;

function addProbe(): HTMLDivElement {
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true");
  element.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;";
  for (const edge of EDGES) element.style.setProperty(`padding-${edge}`, `env(safe-area-inset-${edge}, 0px)`);
  document.body.appendChild(element);
  return element;
}

/** The insets the probe shows, or the last ones read while there is no probe (before the first subscriber). */
function read(): SafeAreaInsets {
  if (!probe) return last;
  const style = getComputedStyle(probe);
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
  readers += 1;
  probe ??= addProbe();
  const stop = onViewportChange(onChange);
  // The probe is new: the insets may differ from what the render read
  onChange();
  return () => {
    stop();
    readers -= 1;
    if (readers === 0) {
      probe?.remove();
      probe = null;
    }
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
