import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import {
  CubeCamera,
  HalfFloatType,
  MathUtils,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLCubeRenderTarget,
} from "three";
import type { ShaderMaterial, Texture, WebGLRenderTarget } from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { LightProbeGenerator } from "three/examples/jsm/lights/LightProbeGenerator.js";
import { SEA_BOUNCE_ALBEDO } from "./atmosphere";
import type { Lighting } from "./lighting";
import {
  groundBounceRadiance,
  relativeLuminance,
  skyEnvironmentFragmentShader,
  skyEnvironmentIntensity,
} from "./skyEnvironment";

export interface SkyEnvironment {
  /** The sky as a PMREM, ready for `textureCubeUV` lookups. */
  texture: Texture;
  /** Height in texels of the PMREM atlas, which sets its `cubeUvDefines`. */
  textureHeight: number;
  /** Scale on the PMREM's radiance; also applied as `scene.environmentIntensity`. */
  intensity: number;
}

/** Edge length of the cube the sky is rendered into to measure its irradiance; SH needs very little. */
const MEASURE_CUBE_SIZE = 16;
const UP = new Vector3(0, 1, 0);

function createEnvironmentSky({ sun, sky: params }: Lighting): Sky {
  const sky = new Sky();
  const material = sky.material as ShaderMaterial;
  material.fragmentShader = skyEnvironmentFragmentShader(material.fragmentShader);
  material.uniforms.groundRadiance = { value: new Vector3() };
  material.uniforms.turbidity.value = params.turbidity;
  material.uniforms.rayleigh.value = params.rayleigh;
  material.uniforms.mieCoefficient.value = params.mieCoefficient;
  material.uniforms.mieDirectionalG.value = params.mieDirectionalG;
  (material.uniforms.sunPosition.value as Vector3).set(...sun.direction);
  return sky;
}

/**
 * Bake the physical sky into an environment map and light the scene with it.
 *
 * Sets `scene.environment` (image-based lighting for every standard material)
 * and returns the same texture for custom shaders such as the ocean. The
 * intensity is measured, not hand-tuned: the sky's irradiance on level ground
 * is read back once and scaled to the clear-sky diffuse share of the sun's
 * (see `skyEnvironmentIntensity`). Returns null until that is done.
 */
export function useSkyEnvironment(lighting: Lighting): SkyEnvironment | null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const [environment, setEnvironment] = useState<SkyEnvironment | null>(null);

  useEffect(() => {
    const sky = createEnvironmentSky(lighting);
    const { sun, sky: skyParams } = lighting;
    const groundRadiance = (sky.material as ShaderMaterial).uniforms.groundRadiance.value as Vector3;
    const skyScene = new Scene();
    skyScene.add(sky);

    // Measure the sky alone (ground black), so the sea bounce, which depends
    // on the resulting intensity, does not feed back into it.
    const measureTarget = new WebGLCubeRenderTarget(MEASURE_CUBE_SIZE, { type: HalfFloatType });
    new CubeCamera(0.1, 100, measureTarget).update(gl, skyScene);

    const pmrem = new PMREMGenerator(gl);
    const previousEnvironment = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    let target: WebGLRenderTarget | null = null;
    let cancelled = false;

    const bake = (intensity: number) => {
      if (cancelled) return;
      groundRadiance.set(
        ...groundBounceRadiance({
          albedo: SEA_BOUNCE_ALBEDO,
          directHorizontal: sun.intensity * Math.sin(MathUtils.degToRad(sun.elevationDeg)),
          diffuseFraction: skyParams.diffuseFraction,
          environmentIntensity: intensity,
        })
      );
      target = pmrem.fromScene(skyScene);
      scene.environment = target.texture;
      scene.environmentIntensity = intensity;
      setEnvironment({ texture: target.texture, textureHeight: target.height, intensity });
    };

    LightProbeGenerator.fromCubeRenderTarget(gl, measureTarget)
      .then((probe) => {
        const e = probe.sh.getIrradianceAt(UP, new Vector3());
        bake(
          skyEnvironmentIntensity({
            measuredSkyIrradiance: relativeLuminance(e.x, e.y, e.z),
            sunIntensity: sun.intensity,
            sunElevationDeg: sun.elevationDeg,
            diffuseFraction: skyParams.diffuseFraction,
          })
        );
      })
      .catch((error: unknown) => {
        console.warn("Sky irradiance measurement failed; using the raw sky.", error);
        bake(1);
      })
      .finally(() => measureTarget.dispose());

    return () => {
      cancelled = true;
      if (target && scene.environment === target.texture) {
        scene.environment = previousEnvironment;
        scene.environmentIntensity = previousIntensity;
      }
      setEnvironment(null);
      target?.dispose();
      pmrem.dispose();
      sky.geometry.dispose();
      (sky.material as ShaderMaterial).dispose();
    };
  }, [gl, scene, lighting]);

  return environment;
}
