import { useSyncExternalStore } from "react";
import { phoneOrientation, type PhoneOrientation } from "./phoneOrientation";

const COARSE = "(pointer: coarse)";

function sample(): PhoneOrientation | null {
  if (typeof window === "undefined") return null;
  const coarse = typeof window.matchMedia === "function" && window.matchMedia(COARSE).matches;
  return phoneOrientation({ width: window.innerWidth, height: window.innerHeight, coarse });
}

function subscribe(onChange: () => void): () => void {
  const mql = typeof window.matchMedia === "function" ? window.matchMedia(COARSE) : null;
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  mql?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
    mql?.removeEventListener("change", onChange);
  };
}

/** "portrait" or "landscape" while on a touch phone, null elsewhere; follows rotation live. */
export function usePhoneOrientation(): PhoneOrientation | null {
  return useSyncExternalStore(subscribe, sample, () => null);
}
