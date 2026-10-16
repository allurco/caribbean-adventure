import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

const width = () => window.innerWidth;

/** The window's inner width in CSS pixels, kept current as it is resized or turned. */
export function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, width);
}
