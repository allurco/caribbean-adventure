import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { DirectionalLight } from "three";
import { controlsTarget } from "../controlsTarget";
import { SEABED_LAYER } from "./seabedPrepass";

interface FillLightProps {
  color: string;
  intensity: number;
  /** Light position relative to the point the camera is looking at. */
  offset: [number, number, number];
}

/**
 * Shadowless fill that follows the camera target (#63): a directional light
 * standing in for the ground bounce the sky map cannot carry (see
 * FILL_COLOR in atmosphere.ts). It casts no shadow, so there is no box to
 * fit; it only has to keep pointing at the focus so its direction stays the
 * same from the player's point of view wherever the camera pans.
 */
export function FillLight({ color, intensity, offset }: FillLightProps) {
  const lightRef = useRef<DirectionalLight>(null);
  const controls = useThree((state) => state.controls);

  // Light the seabed prepass too: three only uses lights on the camera's layers.
  useEffect(() => {
    lightRef.current?.layers.enable(SEABED_LAYER);
  }, []);

  useFrame(() => {
    const light = lightRef.current;
    const target = controlsTarget(controls);
    if (!light || !target) return;
    light.position.set(target.x + offset[0], offset[1], target.z + offset[2]);
    light.target.position.set(target.x, 0, target.z);
    light.target.updateMatrixWorld();
  });

  return (
    <directionalLight
      ref={lightRef}
      color={color}
      intensity={intensity}
      position={offset}
      castShadow={false}
    />
  );
}
