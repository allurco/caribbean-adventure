import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { DirectionalLight } from "three";

interface SunLightProps {
  color: string;
  intensity: number;
  /** Light position relative to the point the camera is looking at. */
  offset: [number, number, number];
  shadowMapSize: number;
  /** Half-width of the orthographic shadow camera, in world units. */
  shadowExtent: number;
}

const ORIGIN = new Vector3();

/** Read the default controls' target (set by MapControls `makeDefault`), if any. */
function controlsTarget(controls: unknown): Vector3 {
  if (
    typeof controls === "object" &&
    controls !== null &&
    "target" in controls &&
    controls.target instanceof Vector3
  ) {
    return controls.target;
  }
  return ORIGIN;
}

/**
 * Shadow-casting sun that keeps its shadow box centred on the camera target,
 * so shadows stay sharp wherever the player pans without needing a shadow
 * map large enough to cover the whole map.
 */
export function SunLight({ color, intensity, offset, shadowMapSize, shadowExtent }: SunLightProps) {
  const lightRef = useRef<DirectionalLight>(null);
  const controls = useThree((state) => state.controls);

  // Snap the focus to whole shadow texels to limit edge shimmer while panning.
  const texel = (shadowExtent * 2) / shadowMapSize;

  useFrame(() => {
    const light = lightRef.current;
    if (!light) return;
    const target = controlsTarget(controls);
    const x = Math.round(target.x / texel) * texel;
    const z = Math.round(target.z / texel) * texel;
    light.position.set(x + offset[0], offset[1], z + offset[2]);
    light.target.position.set(x, 0, z);
    light.target.updateMatrixWorld();
  });

  return (
    <directionalLight
      ref={lightRef}
      color={color}
      intensity={intensity}
      position={offset}
      castShadow
      shadow-mapSize={[shadowMapSize, shadowMapSize]}
      shadow-camera-far={150}
      shadow-camera-left={-shadowExtent}
      shadow-camera-right={shadowExtent}
      shadow-camera-top={shadowExtent}
      shadow-camera-bottom={-shadowExtent}
      shadow-bias={-0.0001}
      shadow-normalBias={0.02}
    />
  );
}
