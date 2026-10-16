import { useSyncExternalStore } from "react";
import { onViewportChange } from "../board/onViewportChange";
import { isPortraitPhone, type ViewportSample } from "./phoneOrientation";

const COARSE = "(pointer: coarse)";

/** The device as `phoneOrientation` reads it: the screen's size, the window's, and whether its primary pointer is a finger. */
export function sampleViewport(): ViewportSample {
  const coarse = typeof window.matchMedia === "function" && window.matchMedia(COARSE).matches;
  return { screenWidth: screen.width, screenHeight: screen.height, width: window.innerWidth, height: window.innerHeight, coarse };
}

const portrait = () => isPortraitPhone(sampleViewport());

function subscribe(onChange: () => void): () => void {
  const pointer = typeof window.matchMedia === "function" ? window.matchMedia(COARSE) : null;
  const stopViewport = onViewportChange(onChange);
  pointer?.addEventListener("change", onChange);
  return () => {
    stopViewport();
    pointer?.removeEventListener("change", onChange);
  };
}

/** True while this is a phone held upright (#123); follows the phone as it turns. */
export function usePortraitPhone(): boolean {
  return useSyncExternalStore(subscribe, portrait, () => false);
}
