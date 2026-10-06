/**
 * The one sway clock for every swaying prop (palms, shrubs; #14, #49).
 *
 * Advances a shared angle uniform once per frame and honours
 * `prefers-reduced-motion`, so one hook call stops every plant on the map
 * together. Materials bind the same uniform object through `injectPalmSway`,
 * so they all read the frame's angle without any per-prop bookkeeping.
 */
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { advanceSwayAngle } from "./palmSway";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

/** The sway angle uniform, in [0, 2π), shared by every material that sways. */
export interface SwayClock {
  readonly angle: { value: number };
}

interface SwayClockState extends SwayClock {
  /** Moves the angle on by one frame of `delta` seconds (held still under reduced motion). */
  advance: (delta: number, reducedMotion: boolean) => void;
}

/** The clock and the closure that ticks it; the uniform object never changes identity. */
function createSwayClock(): SwayClockState {
  const angle = { value: 0 };
  return {
    angle,
    advance: (delta, reducedMotion) => {
      angle.value = advanceSwayAngle(angle.value, delta, reducedMotion);
    },
  };
}

/** Creates the sway clock and advances it every frame; call it once per scene. */
export function useSwayClock(): SwayClock {
  const reducedMotion = usePrefersReducedMotion();
  const clock = useMemo(() => createSwayClock(), []);
  useFrame((_, delta) => clock.advance(delta, reducedMotion));
  return clock;
}
