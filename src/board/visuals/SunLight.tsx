import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { DirectionalLight } from "three";
import { SEABED_LAYER } from "./seabedPrepass";
import { controlsTarget } from "../controlsTarget";
import {
  shadowBoxFor,
  shadowBoxNeedsRefit,
  shadowDepthBias,
  shadowTexel,
  type ShadowBox,
  type SunShadowSettings,
} from "../shadowFit";
import type { DirectionalLighting } from "./lighting";

interface SunLightProps {
  /** The sun from `lightingFor`: colour, intensity and its mount relative to the camera target. */
  sun: DirectionalLighting;
  shadow: SunShadowSettings;
}

/** Where the shadow box sits before the controls exist. */
const ORIGIN = new Vector3();

/**
 * Shadow-casting sun that keeps its shadow box centred on the camera target
 * and fitted to the view (#48): the box only has to cover what is on screen,
 * so the same shadow map gets a finer texel the closer the camera is. Its
 * two sides are fitted apart (#169), across the sun and along it, so a low
 * sun's long shadows keep a fine texel down their length. The box is
 * rebuilt whenever either side grows and, to spare the texel grid, only
 * once one has shrunk past a hysteresis band; the target is snapped to
 * whole texels of the live box so shadow edges do not shimmer while panning.
 */
export function SunLight({ sun, shadow }: SunLightProps) {
  const lightRef = useRef<DirectionalLight>(null);
  const controls = useThree((state) => state.controls);
  const boxRef = useRef<ShadowBox | undefined>(undefined);
  const { offset } = sun;

  // Light the seabed prepass too: three only uses lights on the camera's layers.
  useEffect(() => {
    lightRef.current?.layers.enable(SEABED_LAYER);
  }, []);

  // A settings change (hot reload, tuning) must refit even if the extent is unchanged.
  useEffect(() => {
    boxRef.current = undefined;
  }, [shadow]);

  useFrame(({ camera, size }) => {
    const light = lightRef.current;
    if (!light) return;
    const target = controlsTarget(controls) ?? ORIGIN;

    const distance = camera.position.distanceTo(target);
    const aspect = size.width / Math.max(1, size.height);
    // At town zoom the target sits on the ground (#90), above the sea it sees.
    const wanted = shadowBoxFor(distance, aspect, shadow.fit, target.y);
    const live = boxRef.current;
    if (
      !live ||
      shadowBoxNeedsRefit(live.halfWidth, wanted.halfWidth, shadow.hysteresis) ||
      shadowBoxNeedsRefit(live.halfHeight, wanted.halfHeight, shadow.hysteresis)
    ) {
      boxRef.current = wanted;
      // The coarser of the two light-space texels, so the biases cover either side's slope.
      const texel = shadowTexel(Math.max(wanted.halfWidth, wanted.halfHeight), shadow.mapSize);
      const box = light.shadow.camera;
      box.left = -wanted.halfWidth;
      box.right = wanted.halfWidth;
      box.top = wanted.halfHeight;
      box.bottom = -wanted.halfHeight;
      box.updateProjectionMatrix();
      // Both biases cover a texel's worth of slope, so they follow the texel.
      light.shadow.bias = shadowDepthBias(shadow.biasTexels, texel, shadow.near, shadow.far);
      light.shadow.normalBias = shadow.normalBiasTexels * texel;
    }

    // Snap the focus to whole shadow texels of the live box (its level side,
    // across the sun) to limit edge shimmer while panning.
    const texel = shadowTexel((boxRef.current ?? wanted).halfWidth, shadow.mapSize);
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
      color={sun.color}
      intensity={sun.intensity}
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
