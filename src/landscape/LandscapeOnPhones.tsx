import type { ReactNode } from "react";
import { RotateGate } from "./RotateGate";
import { useLandscapeLockOnFirstGesture } from "./useLandscapeLockOnFirstGesture";
import { usePortraitPhone } from "./usePortraitPhone";

/**
 * Phones play in landscape (#123), in every view. Held upright, the rotate
 * gate covers the app and the app goes inert: no taps, no focus, hidden from
 * screen readers. It is never unmounted, so the game, its canvas and its
 * state carry on underneath. The first tap on a phone also asks Android to go
 * full screen and lock to landscape.
 */
export function LandscapeOnPhones({ children }: { children: ReactNode }) {
  useLandscapeLockOnFirstGesture();
  const gated = usePortraitPhone();
  return (
    <>
      <div className="contents" inert={gated}>
        {children}
      </div>
      {gated && <RotateGate />}
    </>
  );
}
