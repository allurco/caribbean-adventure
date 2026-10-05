/**
 * Runs the FFT wave cascades on the GPU each frame (#38 steps 4–5) and
 * returns their mipmapped slope textures (layout in waveCascadeShaders.ts).
 *
 * Per cascade and frame: one spectrum pass, log2(size) row passes and
 * log2(size) column passes of the Stockham inverse FFT (ping-ponging between
 * two float targets), and one output pass into a half-float target whose
 * mipmaps three regenerates after the draw. For 256² that is 18 small draws,
 * 54 for the three cascades. All cascades run on one wave clock.
 *
 * On a GPU that cannot render to float or half float (waveCascadeSupport.ts)
 * the cascades are skipped: the hook returns flat, zero-slope textures and
 * warns once, so the sea is calm rather than silently broken.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  UnsignedByteType,
  ShaderMaterial,
  WebGLRenderTarget,
} from "three";
import type { Texture, TextureDataType, WebGLRenderer } from "three";
import { butterflyTable, fftStageCount } from "./fftButterfly";
import { initialSpectrum, type WaveCascade } from "./waveCascade";
import { WAVE_LOOP_SECONDS, advanceWaveTime } from "./waveClock";
import {
  FFT_STAGE_FRAGMENT,
  FULLSCREEN_VERTEX,
  SLOPE_OUTPUT_FRAGMENT,
  spectrumFragment,
} from "./waveCascadeShaders";
import { cascadeTargetTypes, type CascadeTargetTypes } from "./waveCascadeSupport";

/** Before the seabed prepass (0.5) and the composer (1), after the controls. */
const CASCADE_PRIORITY = 0.25;

function floatTexture(data: Float32Array, width: number, height: number): DataTexture {
  const t = new DataTexture(data, width, height, RGBAFormat, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

function workTarget(size: number, type: TextureDataType): WebGLRenderTarget {
  return new WebGLRenderTarget(size, size, {
    type,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
}

function pass(fragmentShader: string, uniforms: ShaderMaterial["uniforms"]): ShaderMaterial {
  return new ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false });
}

interface CascadeGpu {
  texture: Texture;
  update: (seconds: number) => void;
  dispose: () => void;
}

let warnedUnsupported = false;

/** A 1×1 texture of zero slope and zero slope variance: a flat sea. */
function flatSlopes(): CascadeGpu {
  const texture = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return { texture, update: () => {}, dispose: () => texture.dispose() };
}

/** GPU resources for each cascade; `dispose` frees them all. */
function createCascadeGpus(cascades: readonly WaveCascade[], gl: WebGLRenderer): CascadeGpu[] {
  const types = cascadeTargetTypes({
    colorBufferFloat: gl.extensions.has("EXT_color_buffer_float"),
    colorBufferHalfFloat: gl.extensions.has("EXT_color_buffer_half_float"),
  });
  if (!types) {
    if (!warnedUnsupported) {
      console.warn("Wave cascades skipped: this GPU cannot render to float or half-float targets; the sea is drawn flat.");
      warnedUnsupported = true;
    }
    return cascades.map(() => flatSlopes());
  }
  return cascades.map((cascade) => createRenderingCascade(cascade, gl, types));
}

function createRenderingCascade(cascade: WaveCascade, gl: WebGLRenderer, types: CascadeTargetTypes): CascadeGpu {
  const { size } = cascade;
  const stages = fftStageCount(size);
  // Full float keeps the 16 butterfly stages accurate; half float where the
  // GPU can only render to half float.
  const workType = types.work === "float" ? FloatType : HalfFloatType;

  const spectrum = floatTexture(initialSpectrum(cascade), size, size);
  const butterfly = floatTexture(butterflyTable(size), size, stages);
  const ping = workTarget(size, workType);
  const pong = workTarget(size, workType);
  const output = new WebGLRenderTarget(size, size, {
    type: HalfFloatType,
    wrapS: RepeatWrapping,
    wrapT: RepeatWrapping,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    generateMipmaps: true,
    anisotropy: gl.capabilities.getMaxAnisotropy(),
  });

  const spectrumPass = pass(spectrumFragment(cascade, WAVE_LOOP_SECONDS), {
    initialSpectrum: { value: spectrum },
    cycles: { value: 0 },
  });
  const fftPass = pass(FFT_STAGE_FRAGMENT, {
    source: { value: null },
    butterfly: { value: butterfly },
    stage: { value: 0 },
    horizontal: { value: true },
  });
  const outputPass = pass(SLOPE_OUTPUT_FRAGMENT, { source: { value: null } });

  // One full-screen triangle.
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new Mesh(geometry, spectrumPass);
  quad.frustumCulled = false;
  const scene = new Scene();
  scene.add(quad);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const draw = (material: ShaderMaterial, target: WebGLRenderTarget) => {
    quad.material = material;
    gl.setRenderTarget(target);
    gl.render(scene, camera);
  };

  /** Rebuild the slope texture for wave time `seconds` (in [0, WAVE_LOOP_SECONDS)). */
  const update = (seconds: number) => {
    const previous = gl.getRenderTarget();
    spectrumPass.uniforms.cycles.value = seconds / WAVE_LOOP_SECONDS;
    draw(spectrumPass, ping);
    let src = ping;
    let dst = pong;
    for (const horizontal of [true, false]) {
      for (let stage = 0; stage < stages; stage++) {
        fftPass.uniforms.source.value = src.texture;
        fftPass.uniforms.stage.value = stage;
        fftPass.uniforms.horizontal.value = horizontal;
        draw(fftPass, dst);
        [src, dst] = [dst, src];
      }
    }
    outputPass.uniforms.source.value = src.texture;
    draw(outputPass, output);
    gl.setRenderTarget(previous);
  };

  const dispose = () => {
    for (const d of [spectrum, butterfly, ping, pong, output, spectrumPass, fftPass, outputPass, geometry]) {
      d.dispose();
    }
  };

  return { texture: output.texture, update, dispose };
}

/**
 * Each cascade's slope texture, in the order given, updated once per frame on
 * one shared clock; frozen under reduced motion. `cascades` should be a stable
 * array: a new one rebuilds every cascade.
 */
export function useWaveCascades(cascades: readonly WaveCascade[], reducedMotion: boolean): Texture[] {
  const gl = useThree((s) => s.gl);
  const gpus = useMemo(() => createCascadeGpus(cascades, gl), [cascades, gl]);
  useEffect(() => () => gpus.forEach((gpu) => gpu.dispose()), [gpus]);
  const textures = useMemo(() => gpus.map((gpu) => gpu.texture), [gpus]);

  const time = useRef(0);
  const drawn = useRef(false);

  useFrame((_, delta) => {
    const next = advanceWaveTime(time.current, delta, reducedMotion);
    if (drawn.current && next === time.current) return; // frozen: the textures are still current
    time.current = next;
    for (const gpu of gpus) gpu.update(next);
    drawn.current = true;
  }, CASCADE_PRIORITY);

  // New GPUs (new cascades or context) have not been drawn yet.
  useEffect(() => {
    drawn.current = false;
  }, [gpus]);

  return textures;
}
