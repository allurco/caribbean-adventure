import { presenceFlag } from "../board/hudPresence";

/**
 * Whether the rotate gate (#123) is up. The app under it is inert, but
 * `inert` stops focus and pointers, not the keyboard listeners on `window`:
 * those wrap their handler in `ignoredUnderGate`, so Enter sails no route
 * and Escape closes nothing behind the gate. The board reads it to pause its
 * frame loop. No React.
 */
export const rotateGatePresence = presenceFlag();

/** `handler`, ignoring every call while the rotate gate shows. */
export function ignoredUnderGate<E>(handler: (event: E) => void): (event: E) => void {
  return (event) => {
    if (!rotateGatePresence.showing()) handler(event);
  };
}
