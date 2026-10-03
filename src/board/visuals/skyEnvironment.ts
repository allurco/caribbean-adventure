/**
 * Pure helpers for the sky environment map (see useSkyEnvironment.ts).
 *
 * The sky is three's Preetham `Sky`, rendered once into a PMREM so every
 * material (islands, ships, the sea's reflection) is lit by the same sky.
 */

const SOLAR_DISC_LINE = "L0 += ( vSunE * 19000.0 * Fex ) * sundisk;";
const UNIFORM_ANCHOR = "uniform vec3 up;";
const OUTPUT_LINE = "gl_FragColor = vec4( retColor, 1.0 );";

/**
 * Adapt three's Sky fragment shader for baking into an environment map:
 *
 * - Drop the solar disc. It is ~19000× the sky and would put a second sun in
 *   the image-based lighting on top of the shadow-casting directional light.
 * - Below the horizon, Sky just repeats the horizon colour, which would light
 *   the undersides of everything like open sky. Replace it with the sea's
 *   own radiance, `groundRadiance` (see `groundBounceRadiance`).
 *
 * Throws if the source no longer has the lines being patched (a three.js
 * upgrade), so the disc can never silently come back.
 */
export function skyEnvironmentFragmentShader(source: string): string {
  for (const marker of [SOLAR_DISC_LINE, UNIFORM_ANCHOR, OUTPUT_LINE]) {
    if (!source.includes(marker)) {
      throw new Error(`Sky shader changed: missing "${marker}"`);
    }
  }
  return source
    .replace(SOLAR_DISC_LINE, "")
    .replace(UNIFORM_ANCHOR, `${UNIFORM_ANCHOR}\n\t\tuniform vec3 groundRadiance;`)
    .replace(
      OUTPUT_LINE,
      `retColor = mix( groundRadiance, retColor, smoothstep( -0.02, 0.0, direction.y ) );\n\t\t\t${OUTPUT_LINE}`
    );
}

export interface GroundBounceInputs {
  albedo: readonly [number, number, number];
  /** Direct sun irradiance on level ground, in scene units (intensity · sin elevation). */
  directHorizontal: number;
  /** Diffuse share of global horizontal irradiance (as in `skyEnvironmentIntensity`). */
  diffuseFraction: number;
  /** The scale the baked sky is lit at (`scene.environmentIntensity`). */
  environmentIntensity: number;
}

/**
 * Radiance of the sea below the horizon, in the baked map's raw units.
 *
 * A diffuse surface of albedo ρ under irradiance E has radiance ρ·E/π. The sea
 * receives the sun's direct light plus the sky's, so E = direct / (1 − f).
 * The map is later scaled by `environmentIntensity`, so this divides by it.
 */
export function groundBounceRadiance({
  albedo,
  directHorizontal,
  diffuseFraction,
  environmentIntensity,
}: GroundBounceInputs): [number, number, number] {
  const scale = directHorizontal / (1 - diffuseFraction) / Math.PI / environmentIntensity;
  return [albedo[0] * scale, albedo[1] * scale, albedo[2] * scale];
}

export interface SkyIntensityInputs {
  /** Luminance of the baked sky's irradiance on an upward-facing surface, at intensity 1. */
  measuredSkyIrradiance: number;
  /** Directional sun intensity (irradiance on a surface facing the sun). */
  sunIntensity: number;
  sunElevationDeg: number;
  /** Diffuse share of global horizontal irradiance under the target sky. */
  diffuseFraction: number;
}

/**
 * Environment intensity that gives the sky its physical share of the light.
 *
 * Under a clear sky a known fraction f of the light on level ground is diffuse
 * sky light and the rest is direct sun, so diffuse = f / (1 − f) × direct.
 * Direct horizontal irradiance from the directional light is I · sin(elevation).
 * The sky's raw brightness from the Preetham model is arbitrary, so it is
 * measured once and scaled to that target.
 */
export function skyEnvironmentIntensity({
  measuredSkyIrradiance,
  sunIntensity,
  sunElevationDeg,
  diffuseFraction,
}: SkyIntensityInputs): number {
  if (!(measuredSkyIrradiance > 0)) {
    throw new RangeError(`Sky irradiance must be positive, got ${measuredSkyIrradiance}`);
  }
  const directHorizontal = sunIntensity * Math.sin((sunElevationDeg * Math.PI) / 180);
  const diffuseTarget = (diffuseFraction / (1 - diffuseFraction)) * directHorizontal;
  return diffuseTarget / measuredSkyIrradiance;
}

/**
 * Share of the downward-facing view, from height `height` above a plane, that
 * a disc of radius `radius` directly below fills (cosine-weighted view factor
 * of a coaxial disc: R² / (R² + h²)).
 */
export function downwardViewFactor(height: number, radius: number): number {
  if (height === 0) return 1;
  return (radius * radius) / (radius * radius + height * height);
}

type Rgb = readonly [number, number, number];

/** Albedo of the sea as seen from above it: shallows fill `shallowShare` of the view, deep water the rest. */
export function seaBounceAlbedo(shallow: Rgb, deep: Rgb, shallowShare: number): [number, number, number] {
  const mix = (i: number) => shallow[i] * shallowShare + deep[i] * (1 - shallowShare);
  return [mix(0), mix(1), mix(2)];
}

/** Rec. 709 relative luminance of a linear RGB colour. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function glslFloat(value: number): string {
  const s = String(value);
  return s.includes(".") ? s : `${s}.0`;
}

/**
 * Defines a ShaderMaterial needs to sample a PMREM with three's
 * `cube_uv_reflection_fragment` chunk. Built-in materials get these from
 * three's program cache; this mirrors `generateCubeUVSize` in WebGLProgram.
 */
export function cubeUvDefines(imageHeight: number): Record<string, string> {
  const maxMip = Math.log2(imageHeight) - 2;
  const texelHeight = 1 / imageHeight;
  const texelWidth = 1 / (3 * Math.max(Math.pow(2, maxMip), 7 * 16));
  return {
    ENVMAP_TYPE_CUBE_UV: "",
    CUBEUV_TEXEL_WIDTH: glslFloat(texelWidth),
    CUBEUV_TEXEL_HEIGHT: glslFloat(texelHeight),
    CUBEUV_MAX_MIP: glslFloat(maxMip),
  };
}
