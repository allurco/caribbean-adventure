import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { DirectionalLight } from "three";
import { controlsTarget } from "../controlsTarget";
import type { DirectionalLighting } from "./lighting";
import { SEABED_LAYER } from "./seabedPrepass";

interface FillLightProps {
  /** The fill from `lightingFor`: colour, intensity and its mount relative to the camera target. */
  fill: DirectionalLighting;
}

/**
 * Shadowless fill that follows the camera target (#63): a directional light
 * standing in for the ground bounce the sky map cannot carry (see
 * the fill in lighting.ts). It casts no shadow, so there is no box to
 * fit; it only has to keep pointing at the focus so its direction stays the
 * same from the player's point of view wherever the camera pans.
 */
export function FillLight({ fill }: FillLightProps) {
  const { color, intensity, offset } = fill;
  const lightRef = useRef<DirectionalLight>(null);
  const controls = useThree((state) => state.controls);

  // Light the seabed prepass too: three only uses lights on the camera's
  // layers. The seabed's caustic scales only the sun (seabedCaustics.ts
  // guards it to directional light 0); this light reaches it unfocused.
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
