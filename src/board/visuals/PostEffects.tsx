import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, Effect, ToneMappingMode } from "postprocessing";
import { Uniform, Vector3, type WebGLRenderer } from "three";
import type { Lighting } from "./lighting";

/** The colour grade after ACES: a per-channel gain (`Lighting.grade.gain`). */
const GRADE_FRAGMENT = /* glsl */ `
uniform vec3 gain;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb * gain, inputColor.a);
}
`;

/** Sets the renderer's exposure; returns the undo. */
function setRendererExposure(renderer: WebGLRenderer, exposure: number): () => void {
  const previous = renderer.toneMappingExposure;
  renderer.toneMappingExposure = exposure;
  return () => {
    renderer.toneMappingExposure = previous;
  };
}

interface PostEffectsProps {
  lighting: Lighting;
}

/**
 * The scene's post-processing, all from `lighting` (#169): bloom, vignette,
 * ACES under the lighting's exposure, then the warm grade. The effects merge
 * into one effect pass after the render pass (bloom's blur runs its own
 * mip chain), so the grade adds no pass.
 */
export function PostEffects({ lighting }: PostEffectsProps) {
  const gl = useThree((state) => state.gl);
  const { bloom, vignette, grade } = lighting;

  // ACES reads the renderer's exposure uniform (three's tone-mapping chunk).
  useEffect(() => setRendererExposure(gl, grade.exposure), [gl, grade.exposure]);

  const gradeEffect = useMemo(
    () =>
      new Effect("ColourGrade", GRADE_FRAGMENT, {
        blendFunction: BlendFunction.SRC,
        uniforms: new Map([["gain", new Uniform(new Vector3())]]),
      }),
    []
  );
  useEffect(() => () => gradeEffect.dispose(), [gradeEffect]);
  useEffect(() => {
    (gradeEffect.uniforms.get("gain")?.value as Vector3).set(...grade.gain);
  }, [gradeEffect, grade.gain]);

  return (
    <EffectComposer>
      <Bloom intensity={bloom.intensity} luminanceThreshold={bloom.threshold} luminanceSmoothing={bloom.smoothing} />
      <Vignette darkness={vignette.darkness} offset={vignette.offset} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={gradeEffect} />
    </EffectComposer>
  );
}
