import { createContext, useContext } from "react";

/**
 * Whether the scene's motion is held (#122): the surf and the palms' sway
 * stand at their first moment, as the wave clock does when it is frozen. The
 * harbour backdrop holds them until its fade begins, so the fade shows
 * nothing but the water starting to move from the still's pose. The board
 * never holds them: the default is "not held". Reduced motion is separate
 * (usePrefersReducedMotion) and still applies when this is false.
 */
export const MotionHeldContext = createContext(false);

/** Whether the scene's motion is held (MotionHeldContext). */
export function useMotionHeld(): boolean {
  return useContext(MotionHeldContext);
}
