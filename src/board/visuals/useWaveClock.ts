import { useState } from "react";
import { useFrame } from "@react-three/fiber";
import { WAVE_CLOCK_PRIORITY } from "./frameOrder";
import { createWaveClock, type WaveClock } from "./waveClock";

/**
 * The scene's one wave clock (waveClock.ts), advanced once per frame before
 * anything reads it and frozen under reduced motion. Mount it once and hand
 * it to the cascades and every CPU reader of the sea.
 */
export function useWaveClock(reducedMotion: boolean): WaveClock {
  const [clock] = useState(createWaveClock);
  useFrame((_, delta) => clock.advance(delta, reducedMotion), WAVE_CLOCK_PRIORITY);
  return clock;
}
