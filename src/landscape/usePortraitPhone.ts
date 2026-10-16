import { useSyncExternalStore } from "react";
import { isPortraitPhone, type ViewportSample } from "./phoneOrientation";

const COARSE = "(pointer: coarse)";

/** The window as `phoneOrientation` reads it: its size and whether its primary pointer is a finger. */
export function sampleViewport(): ViewportSample {
  const coarse = typeof window.matchMedia === "function" && window.matchMedia(COARSE).matches;
  return { width: window.innerWidth, height: window.innerHeight, coarse };
}

const portrait = () => isPortraitPhone(sampleViewport());

function subscribe(onChange: () => void): () => void {
  const pointer = typeof window.matchMedia === "function" ? window.matchMedia(COARSE) : null;
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  pointer?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
    pointer?.removeEventListener("change", onChange);
  };
}

/** True while this is a phone held upright (#123); follows the phone as it turns. */
export function usePortraitPhone(): boolean {
  return useSyncExternalStore(subscribe, portrait, () => false);
}
