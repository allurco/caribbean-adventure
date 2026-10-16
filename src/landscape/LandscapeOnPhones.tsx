import type { ReactNode } from "react";
import { RotateGate } from "./RotateGate";
import { useLandscapeLockOnFirstGesture } from "./useLandscapeLockOnFirstGesture";
import { usePortraitPhone } from "./usePortraitPhone";

/**
 * Phones play in landscape (#123), in every view. Held upright, the rotate
 * gate covers the app and the app goes inert and `aria-hidden` (a backstop
 * where `inert` is missing): no taps, no focus, hidden from screen readers.
 * The first tap on a phone also asks Android to go full screen and lock to
 * landscape.
 *
 * The wrapper always renders, first, with the gate as its sibling: never
 * `gated ? <RotateGate /> : children`, which would unmount the game, its
 * canvas and its state each time the phone turns. `LandscapeOnPhones.test.tsx`
 * counts the game's mounts.
 */
export function LandscapeOnPhones({ children }: { children: ReactNode }) {
  useLandscapeLockOnFirstGesture();
  const gated = usePortraitPhone();
  return (
    <>
      <div className="contents" inert={gated} aria-hidden={gated || undefined}>
        {children}
      </div>
      {gated && <RotateGate />}
    </>
  );
}
