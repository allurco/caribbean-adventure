import { useSyncExternalStore } from "react";
import { rotateGatePresence } from "./rotateGatePresence";

/** True while the rotate gate (#123) covers the page. */
export function useRotateGateShowing(): boolean {
  return useSyncExternalStore(rotateGatePresence.subscribe, rotateGatePresence.showing, () => false);
}
