import { useEffect } from "react";
import { onFirstGesture } from "./firstGesture";
import { browserCanLockLandscape, browserLockPorts, lockLandscape } from "./landscapeLock";
import { isPhone } from "./phoneOrientation";
import { sampleViewport } from "./usePortraitPhone";

/**
 * On a phone, the first tap anywhere (signing in, a move, the rotate gate)
 * asks the browser to go full screen and lock to landscape (#123). Only where
 * both APIs exist (Android Chrome); fire and forget, it never blocks the tap.
 */
export function useLandscapeLockOnFirstGesture(): void {
  useEffect(() => {
    if (!browserCanLockLandscape()) return;
    return onFirstGesture(window, () => {
      if (isPhone(sampleViewport())) void lockLandscape(browserLockPorts());
    });
  }, []);
}
