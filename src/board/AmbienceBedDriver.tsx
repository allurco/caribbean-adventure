import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ambienceBed } from "../audio/sharedAmbienceBed";
import { controlsTarget } from "./controlsTarget";

/**
 * Feeds the open-sea ambience bed the camera's distance from its focus every
 * frame (#73), so it crossfades from close water at ship zoom to the wide sea
 * at map zoom. Silent until the first click unlocks audio; stops the bed when
 * the board goes away.
 */
export function AmbienceBedDriver() {
  const controls = useThree((state) => state.controls);

  useEffect(() => {
    ambienceBed.setPaused(false);
    return () => ambienceBed.stop();
  }, []);

  useFrame(({ camera }) => {
    const target = controlsTarget(controls);
    if (target) ambienceBed.setDistance(camera.position.distanceTo(target));
  });

  return null;
}
