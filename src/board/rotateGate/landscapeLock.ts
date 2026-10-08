import { useEffect } from "react";
import { phoneOrientation } from "./phoneOrientation";

/**
 * Android's half of landscape-only phones: go full screen, then lock the
 * screen to landscape (Chrome allows the lock only in full screen, and both
 * need a user gesture). iOS Safari has neither API on iPhone, so every step
 * is feature-checked and every failure swallowed: the rotate gate is the
 * fallback and nothing ever waits on this.
 */

type LockableOrientation = ScreenOrientation & { lock?: (o: "landscape") => Promise<void> };

function onPhone(): boolean {
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return phoneOrientation({ width: window.innerWidth, height: window.innerHeight, coarse }) !== null;
}

/** True when this browser has both APIs (Android Chrome); false on iOS and desktop Safari. */
export function canLockLandscape(): boolean {
  if (typeof document === "undefined") return false;
  const orientation = screen.orientation as LockableOrientation | undefined;
  return typeof document.documentElement.requestFullscreen === "function" && document.fullscreenEnabled && typeof orientation?.lock === "function";
}

/** Full screen, then lock to landscape. Resolves true if the lock took; never throws. Call from a user gesture. */
export async function lockLandscape(): Promise<boolean> {
  if (!canLockLandscape()) return false;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    await (screen.orientation as LockableOrientation).lock?.("landscape");
    return true;
  } catch {
    return false;
  }
}

/**
 * On a phone, try the lock on the first tap anywhere (signing in, "Take
 * your turn", or tapping the gate). Listens in the capture phase so no
 * component's stopPropagation hides the gesture. Only `pointerup` and
 * `touchend` count: a touch `pointerdown` does not grant user activation.
 */
export function useLandscapeLockOnFirstTap(): void {
  useEffect(() => {
    if (!canLockLandscape()) return;
    const opts = { capture: true } as const;
    const onTap = () => {
      window.removeEventListener("pointerup", onTap, opts);
      window.removeEventListener("touchend", onTap, opts);
      if (onPhone()) void lockLandscape();
    };
    window.addEventListener("pointerup", onTap, opts);
    window.addEventListener("touchend", onTap, opts);
    return () => {
      window.removeEventListener("pointerup", onTap, opts);
      window.removeEventListener("touchend", onTap, opts);
    };
  }, []);
}
