import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import {
  CubeCamera,
  HalfFloatType,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLCubeRenderTarget,
} from "three";
import type { ShaderMaterial, Texture } from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { LightProbeGenerator } from "three/examples/jsm/lights/LightProbeGenerator.js";
import {
  SEA_BOUNCE_ALBEDO,
  SKY_DIFFUSE_FRACTION,
  SKY_MIE_COEFFICIENT,
  SKY_MIE_DIRECTIONAL_G,
  SKY_RAYLEIGH,
  SKY_TURBIDITY,
  SUN_ELEVATION_DEG,
  SUN_INTENSITY,
} from "./atmosphere";
import { relativeLuminance, skyEnvironmentFragmentShader, skyEnvironmentIntensity } from "./skyEnvironment";
import type { Vec3 } from "./sunDirection";

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

function createEnvironmentSky(sun: Vec3): Sky {
  const sky = new Sky();
  const material = sky.material as ShaderMaterial;
  material.fragmentShader = skyEnvironmentFragmentShader(material.fragmentShader);
  material.uniforms.groundAlbedo = { value: new Vector3(...SEA_BOUNCE_ALBEDO) };
  material.uniforms.turbidity.value = SKY_TURBIDITY;
  material.uniforms.rayleigh.value = SKY_RAYLEIGH;
  material.uniforms.mieCoefficient.value = SKY_MIE_COEFFICIENT;
  material.uniforms.mieDirectionalG.value = SKY_MIE_DIRECTIONAL_G;
  (material.uniforms.sunPosition.value as Vector3).set(...sun);
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
export function useSkyEnvironment(sun: Vec3): SkyEnvironment | null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const [environment, setEnvironment] = useState<SkyEnvironment | null>(null);

  useEffect(() => {
    const sky = createEnvironmentSky(sun);
    const skyScene = new Scene();
    skyScene.add(sky);

    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(skyScene);

    const measureTarget = new WebGLCubeRenderTarget(MEASURE_CUBE_SIZE, { type: HalfFloatType });
    new CubeCamera(0.1, 100, measureTarget).update(gl, skyScene);

    const previousEnvironment = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    let cancelled = false;

    const apply = (intensity: number) => {
      if (cancelled) return;
      scene.environment = target.texture;
      scene.environmentIntensity = intensity;
      setEnvironment({ texture: target.texture, textureHeight: target.height, intensity });
    };

    LightProbeGenerator.fromCubeRenderTarget(gl, measureTarget)
      .then((probe) => {
        const e = probe.sh.getIrradianceAt(UP, new Vector3());        apply(
          skyEnvironmentIntensity({
            measuredSkyIrradiance: relativeLuminance(e.x, e.y, e.z),
            sunIntensity: SUN_INTENSITY,
            sunElevationDeg: SUN_ELEVATION_DEG,
            diffuseFraction: SKY_DIFFUSE_FRACTION,
          })
        );
      })
      .catch((error: unknown) => {
        console.warn("Sky irradiance measurement failed; using the raw sky.", error);
        apply(1);
      })
      .finally(() => measureTarget.dispose());

    return () => {
      cancelled = true;
      if (scene.environment === target.texture) {
        scene.environment = previousEnvironment;
        scene.environmentIntensity = previousIntensity;
      }
      setEnvironment(null);
      target.dispose();
      pmrem.dispose();
      sky.geometry.dispose();
      (sky.material as ShaderMaterial).dispose();
    };
  }, [gl, scene, sun]);

  return environment;
}
