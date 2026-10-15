import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, ToneMapping } from "@react-three/postprocessing";
import { COMPOSER_MULTISAMPLING } from "../canvasSetup";
import { BlendFunction, Effect, EffectPass, ToneMappingMode } from "postprocessing";
import { FloatType, HalfFloatType, Uniform, Vector3, type WebGLRenderer } from "three";
import { BLOOM_SANITIZE_GLSL } from "./bloomSanitize";
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
  /** Leave the bloom out (`?bloom=0`, an A/B check on a real GPU). */
  withoutBloom?: boolean;
  /** The composer's multisampling (`?aa=0` gives 0); `COMPOSER_MULTISAMPLING` when left out. */
  multisampling?: number;
  /** Sanitize the bloom's input (bloomSanitize.ts); off under `?bloomsan=0`. */
  sanitizeBloomInput?: boolean;
  /** The bloom's mipmap blur; its Kawase blur instead under `?bloommip=0`. */
  mipmapBlur?: boolean;
  /** The composer's buffers: half floats, or full floats under `?bloomhalf=0`. */
  frameBuffer?: "half" | "float";
}

/**
 * The scene's post-processing, all from `lighting` (#169): bloom, vignette,
 * ACES under the lighting's exposure, then the warm grade. The bloom's input
 * is sanitized first, in a pass of its own (bloomSanitize.ts); the bloom,
 * vignette, tone mapping and grade then merge into one effect pass (bloom's
 * blur runs its own mip chain), so the grade adds no pass.
 */
export function PostEffects({
  lighting,
  withoutBloom = false,
  multisampling = COMPOSER_MULTISAMPLING,
  sanitizeBloomInput = true,
  mipmapBlur = true,
  frameBuffer = "half",
}: PostEffectsProps) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
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
  // A pass of its own, not an effect merged with the bloom: the bloom reads its pass's input buffer, so only an
  // earlier pass changes what it blurs (bloomSanitize.ts)
  const sanitizePass = useMemo(
    () => new EffectPass(camera, new Effect("BloomInputSanitize", BLOOM_SANITIZE_GLSL, { blendFunction: BlendFunction.SRC })),
    [camera]
  );
  useEffect(() => () => sanitizePass.dispose(), [sanitizePass]);
  useEffect(() => {
    (gradeEffect.uniforms.get("gain")?.value as Vector3).set(...grade.gain);
  }, [gradeEffect, grade.gain]);

  return (
    <EffectComposer multisampling={multisampling} frameBufferType={frameBuffer === "float" ? FloatType : HalfFloatType}>
      {/* A keyed array, not `{!withoutBloom && <Bloom />}`: the composer's children are typed
          `JSX.Element | JSX.Element[]`, so a `false` child does not type-check; the keys keep the
          other passes mounted, in order, when the bloom is left out. */}
      {[
        ...(withoutBloom
          ? []
          : [
              ...(sanitizeBloomInput ? [<primitive key="sanitize" object={sanitizePass} />] : []),
              <Bloom
                key="bloom"
                mipmapBlur={mipmapBlur}
                intensity={bloom.intensity}
                luminanceThreshold={bloom.threshold}
                luminanceSmoothing={bloom.smoothing}
              />,
            ]),
        <Vignette key="vignette" darkness={vignette.darkness} offset={vignette.offset} />,
        <ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />,
        <primitive key="grade" object={gradeEffect} />,
      ]}
    </EffectComposer>
  );
}
