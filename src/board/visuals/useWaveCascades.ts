/**
 * Runs the FFT wave cascades on the GPU each frame (#38 steps 4–5) and
 * returns their mipmapped slope textures (layout in waveCascadeShaders.ts),
 * plus the whitecap foam each whitecapping cascade has accumulated (step 7).
 *
 * The cascades are batched side by side in one atlas (waveCascadeAtlas.ts),
 * so each frame is one spectrum pass, log2(size) row passes and log2(size)
 * column passes of the Stockham inverse FFT (ping-ponging between two float
 * targets) for all of them, then one output pass per cascade into its own
 * half-float target, whose mipmaps three regenerates after the draw. For
 * three 256² cascades that is 20 draws a frame; run one by one they took 54,
 * and the per-draw cost, not the pixels, dominated. All cascades share one
 * wave clock and one grid size.
 *
 * Whitecaps add one draw per whitecapping cascade (two for the trade-wind
 * sea): a tile-space ping-pong pair of the cascade's size that integrates
 * the fold of its Jacobian (whitecapFoam.ts). The pair swaps every frame, so
 * `whitecaps[i]` is replaced in place each update: read it in a frame
 * callback after CASCADE_PRIORITY, not once at material creation.
 *
 * The displacement (#38 step 8) adds one block of the working atlas per
 * displacing cascade, transformed by the same FFT draws (the working targets
 * are wider, not more numerous), and one output draw per displacing cascade
 * into its own mipmapped tile texture of (h, Dx, Dz). For the trade-wind
 * sea's two displaced cascades that is 24 draws a frame in all: 1 spectrum,
 * 16 FFT stages, 3 slope and 2 displacement outputs, 2 whitecap steps.
 *
 * On a GPU that cannot render to float or half float (waveCascadeSupport.ts)
 * the cascades are skipped: the hook returns flat, zero-slope textures and
 * warns once, so the sea is calm rather than silently broken.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BufferGeometry,
  Color,
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
import { atlasBlockCount, displacementBlockColumn, packCascadeAtlas } from "./waveCascadeAtlas";
import { WAVE_LOOP_SECONDS, advanceWaveTime, waveTimeStep } from "./waveClock";
import {
  DISPLACEMENT_OUTPUT_FRAGMENT,
  FFT_STAGE_FRAGMENT,
  FULLSCREEN_VERTEX,
  SLOPE_OUTPUT_FRAGMENT,
  WHITECAP_ACCUMULATE_FRAGMENT,
  spectrumFragment,
} from "./waveCascadeShaders";
import { cascadeTargetTypes, type CascadeTargetTypes } from "./waveCascadeSupport";
import { whitecapDecay, whitecapInjection } from "./whitecapFoam";

/** Before the seabed prepass (0.5) and the composer (1), after the controls. */
export const CASCADE_PRIORITY = 0.25;

function floatTexture(data: Float32Array, width: number, height: number): DataTexture {
  const t = new DataTexture(data, width, height, RGBAFormat, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

function workTarget(width: number, height: number, type: TextureDataType): WebGLRenderTarget {
  return new WebGLRenderTarget(width, height, {
    type,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
}

/** A tiling, mipmapped half-float target the water samples: the slope outputs and the whitecap accumulators. */
function tileTarget(size: number, gl: WebGLRenderer): WebGLRenderTarget {
  return new WebGLRenderTarget(size, size, {
    type: HalfFloatType,
    wrapS: RepeatWrapping,
    wrapT: RepeatWrapping,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    generateMipmaps: true,
    anisotropy: gl.capabilities.getMaxAnisotropy(),
  });
}

function pass(fragmentShader: string, uniforms: ShaderMaterial["uniforms"]): ShaderMaterial {
  return new ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false });
}

export interface WaveCascadeTextures {
  /** One slope texture per cascade, in order; stable objects. */
  slopes: Texture[];
  /** One accumulated-whitecap texture per entry of `whitecaps` (the cascade indices given); replaced in place every update. */
  whitecaps: Texture[];
  /** One (h, Dx, Dz) displacement texture per displaced cascade, in the order given; stable objects. */
  displacements: Texture[];
}

interface CascadesGpu extends WaveCascadeTextures {
  /** Rebuild for wave time `seconds`, `stepSeconds` on from the last update. */
  update: (seconds: number, stepSeconds: number) => void;
  dispose: () => void;
}

let warnedUnsupported = false;

const BLACK = new Color(0);

/** 1×1 textures of zero slope, zero slope variance, no foam and no displacement: a flat, calm sea. */
function flatSlopes(count: number, whitecapCount: number, displacedCount: number): CascadesGpu {
  const flat = () => {
    const texture = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat, UnsignedByteType);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  };
  const slopes = Array.from({ length: count }, flat);
  const whitecaps = Array.from({ length: whitecapCount }, flat);
  const displacements = Array.from({ length: displacedCount }, flat);
  return {
    slopes,
    whitecaps,
    displacements,
    update: () => {},
    dispose: () => [...slopes, ...whitecaps, ...displacements].forEach((t) => t.dispose()),
  };
}

/** GPU resources for the cascades; `dispose` frees them all. */
function createCascadesGpu(
  cascades: readonly WaveCascade[],
  whitecapCascades: readonly number[],
  displacementCascades: readonly number[],
  gl: WebGLRenderer
): CascadesGpu {
  const types = cascadeTargetTypes({
    colorBufferFloat: gl.extensions.has("EXT_color_buffer_float"),
    colorBufferHalfFloat: gl.extensions.has("EXT_color_buffer_half_float"),
  });
  if (!types) {
    if (!warnedUnsupported) {
      console.warn("Wave cascades skipped: this GPU cannot render to float or half-float targets; the sea is drawn flat.");
      warnedUnsupported = true;
    }
    return flatSlopes(cascades.length, whitecapCascades.length, displacementCascades.length);
  }
  return createRenderingCascades(cascades, whitecapCascades, displacementCascades, gl, types);
}

function createRenderingCascades(
  cascades: readonly WaveCascade[],
  whitecapCascades: readonly number[],
  displacementCascades: readonly number[],
  gl: WebGLRenderer,
  types: CascadeTargetTypes
): CascadesGpu {
  const { size } = cascades[0];
  // The working atlas carries the displacement blocks too; the initial spectrum only the cascades' own.
  const width = size * atlasBlockCount(cascades.length, displacementCascades);
  const stages = fftStageCount(size);
  // Full float keeps the 16 butterfly stages accurate; half float where the
  // GPU can only render to half float.
  const workType = types.work === "float" ? FloatType : HalfFloatType;

  const spectrum = floatTexture(packCascadeAtlas(cascades.map(initialSpectrum), size), size * cascades.length, size);
  const butterfly = floatTexture(butterflyTable(size), size, stages);
  const ping = workTarget(width, size, workType);
  const pong = workTarget(width, size, workType);
  const outputs = cascades.map(() => tileTarget(size, gl));
  const displacementOutputs = displacementCascades.map(() => tileTarget(size, gl));
  // Per whitecapping cascade, a ping-pong pair in its tile space.
  const accumulators = whitecapCascades.map((c) => ({
    cascade: c,
    targets: [tileTarget(size, gl), tileTarget(size, gl)],
    latest: 0,
  }));

  const spectrumPass = pass(spectrumFragment(cascades, WAVE_LOOP_SECONDS, displacementCascades), {
    initialSpectrum: { value: spectrum },
    cycles: { value: 0 },
  });
  const fftPass = pass(FFT_STAGE_FRAGMENT, {
    source: { value: null },
    butterfly: { value: butterfly },
    stage: { value: 0 },
    horizontal: { value: true },
  });
  const outputPass = pass(SLOPE_OUTPUT_FRAGMENT, { source: { value: null }, column: { value: 0 } });
  const displacementPass = pass(DISPLACEMENT_OUTPUT_FRAGMENT, { source: { value: null }, column: { value: 0 } });
  const whitecapPass = pass(WHITECAP_ACCUMULATE_FRAGMENT, {
    jacobian: { value: null },
    previous: { value: null },
    decay: { value: 1 },
    injection: { value: 0 },
  });

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

  // The accumulators start empty: a fresh target's contents are undefined.
  {
    const previous = gl.getRenderTarget();
    const clearColor = new Color();
    gl.getClearColor(clearColor);
    const clearAlpha = gl.getClearAlpha();
    gl.setClearColor(BLACK, 0);
    for (const { targets } of accumulators) {
      for (const target of targets) {
        gl.setRenderTarget(target);
        gl.clear(true, false, false);
      }
    }
    gl.setClearColor(clearColor, clearAlpha);
    gl.setRenderTarget(previous);
  }

  const whitecaps = accumulators.map((a) => a.targets[a.latest].texture);

  /** Rebuild the slope textures for wave time `seconds` (in [0, WAVE_LOOP_SECONDS)) and advance the whitecaps by `stepSeconds`. */
  const update = (seconds: number, stepSeconds: number) => {
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
    outputs.forEach((output, c) => {
      outputPass.uniforms.column.value = c * size;
      draw(outputPass, output);
    });
    displacementPass.uniforms.source.value = src.texture;
    displacementOutputs.forEach((output, d) => {
      displacementPass.uniforms.column.value = displacementBlockColumn(cascades.length, d, size);
      draw(displacementPass, output);
    });
    whitecapPass.uniforms.decay.value = whitecapDecay(stepSeconds);
    whitecapPass.uniforms.injection.value = whitecapInjection(stepSeconds);
    accumulators.forEach((a, i) => {
      const next = 1 - a.latest;
      whitecapPass.uniforms.jacobian.value = outputs[a.cascade].texture;
      whitecapPass.uniforms.previous.value = a.targets[a.latest].texture;
      draw(whitecapPass, a.targets[next]);
      a.latest = next;
      whitecaps[i] = a.targets[next].texture;
    });
    gl.setRenderTarget(previous);
  };

  const dispose = () => {
    const targets = accumulators.flatMap((a) => a.targets);
    const resources = [spectrum, butterfly, ping, pong, ...outputs, ...displacementOutputs, ...targets];
    for (const d of [...resources, spectrumPass, fftPass, outputPass, displacementPass, whitecapPass, geometry]) {
      d.dispose();
    }
  };

  return {
    slopes: outputs.map((o) => o.texture),
    whitecaps,
    displacements: displacementOutputs.map((o) => o.texture),
    update,
    dispose,
  };
}

/**
 * Each cascade's slope texture, in the order given, the whitecap foam of the
 * cascades at indices `whitecapCascades` and the displacement of those at
 * `displacementCascades`, updated once per frame on one shared clock; frozen
 * under reduced motion (the foam neither grows nor decays then, and the
 * surface holds still). `cascades`, `whitecapCascades` and
 * `displacementCascades` should be stable arrays of one grid size: a new
 * array rebuilds every cascade.
 */
export function useWaveCascades(
  cascades: readonly WaveCascade[],
  whitecapCascades: readonly number[],
  displacementCascades: readonly number[],
  reducedMotion: boolean
): WaveCascadeTextures {
  const gl = useThree((s) => s.gl);
  const gpu = useMemo(
    () => createCascadesGpu(cascades, whitecapCascades, displacementCascades, gl),
    [cascades, whitecapCascades, displacementCascades, gl]
  );
  useEffect(() => () => gpu.dispose(), [gpu]);

  const time = useRef(0);
  const drawn = useRef(false);

  useFrame((_, delta) => {
    const next = advanceWaveTime(time.current, delta, reducedMotion);
    if (drawn.current && next === time.current) return; // frozen: the textures are still current
    const step = drawn.current ? waveTimeStep(time.current, next) : 0;
    time.current = next;
    gpu.update(next, step);
    drawn.current = true;
  }, CASCADE_PRIORITY);

  // A new GPU (new cascades or context) has not been drawn yet.
  useEffect(() => {
    drawn.current = false;
  }, [gpu]);

  return gpu;
}
