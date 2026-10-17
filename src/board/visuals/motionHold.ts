import { createContext, useContext } from "react";

/**
 * Whether the scene's motion is held (#122): the surf and the palms' sway
 * stand at their first moment, as the wave clock does when it is frozen. The
 * harbour scene the shell's still is captured from holds them, so two
 * captures give the same still (docs/harbour-still.md). The board never
 * holds them: the default is "not held". Reduced motion is separate
 * (usePrefersReducedMotion) and still applies when this is false.
 */
export const MotionHeldContext = createContext(false);

/** Whether the scene's motion is held (MotionHeldContext). */
export function useMotionHeld(): boolean {
  return useContext(MotionHeldContext);
}
