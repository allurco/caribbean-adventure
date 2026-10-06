import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { DirectionalLight } from "three";
import { SEABED_LAYER } from "./seabedPrepass";
import { controlsTarget } from "../controlsTarget";
import {
  shadowBoxNeedsRefit,
  shadowDepthBias,
  shadowExtentFor,
  shadowTexel,
  type SunShadowSettings,
} from "../shadowFit";

interface SunLightProps {
  color: string;
  intensity: number;
  /** Light position relative to the point the camera is looking at. */
  offset: [number, number, number];
  shadow: SunShadowSettings;
}

/** Where the shadow box sits before the controls exist. */
const ORIGIN = new Vector3();

/**
 * Shadow-casting sun that keeps its shadow box centred on the camera target
 * and fitted to the view (#48): the box only has to cover what is on screen,
 * so the same shadow map gets a finer texel the closer the camera is. The
 * box is rebuilt whenever the fitted extent grows and, to spare the texel
 * grid, only once it has shrunk past a hysteresis band; the target is
 * snapped to whole texels of the live box so shadow edges do not shimmer
 * while panning.
 */
export function SunLight({ color, intensity, offset, shadow }: SunLightProps) {
  const lightRef = useRef<DirectionalLight>(null);
  const controls = useThree((state) => state.controls);
  const extentRef = useRef<number | undefined>(undefined);

  // Light the seabed prepass too: three only uses lights on the camera's layers.
  useEffect(() => {
    lightRef.current?.layers.enable(SEABED_LAYER);
  }, []);

  // A settings change (hot reload, tuning) must refit even if the extent is unchanged.
  useEffect(() => {
    extentRef.current = undefined;
  }, [shadow]);

  useFrame(({ camera, size }) => {
    const light = lightRef.current;
    if (!light) return;
    const target = controlsTarget(controls) ?? ORIGIN;

    const distance = camera.position.distanceTo(target);
    const aspect = size.width / Math.max(1, size.height);
    const wanted = shadowExtentFor(distance, aspect, shadow.fit);
    if (shadowBoxNeedsRefit(extentRef.current, wanted, shadow.hysteresis)) {
      extentRef.current = wanted;
      const texel = shadowTexel(wanted, shadow.mapSize);
      const box = light.shadow.camera;
      box.left = -wanted;
      box.right = wanted;
      box.top = wanted;
      box.bottom = -wanted;
      box.updateProjectionMatrix();
      // Both biases cover a texel's worth of slope, so they follow the texel.
      light.shadow.bias = shadowDepthBias(shadow.biasTexels, texel, shadow.near, shadow.far);
      light.shadow.normalBias = shadow.normalBiasTexels * texel;
    }

    // Snap the focus to whole shadow texels of the live box to limit edge shimmer while panning.
    const texel = shadowTexel(extentRef.current ?? wanted, shadow.mapSize);
    const x = Math.round(target.x / texel) * texel;
    const z = Math.round(target.z / texel) * texel;
    light.position.set(x + offset[0], offset[1], z + offset[2]);
    light.target.position.set(x, 0, z);
    light.target.updateMatrixWorld();
  });

  const { maxExtent } = shadow.fit;
  return (
    <directionalLight
      ref={lightRef}
      color={color}
      intensity={intensity}
      position={offset}
      castShadow
      shadow-mapSize={[shadow.mapSize, shadow.mapSize]}
      shadow-camera-near={shadow.near}
      shadow-camera-far={shadow.far}
      shadow-camera-left={-maxExtent}
      shadow-camera-right={maxExtent}
      shadow-camera-top={maxExtent}
      shadow-camera-bottom={-maxExtent}
      shadow-radius={shadow.radius}
    />
  );
}
