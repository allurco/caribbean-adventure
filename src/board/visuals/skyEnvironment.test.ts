import { describe, expect, it } from "vitest";
import type { ShaderMaterial } from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import {
  cubeUvDefines,
  relativeLuminance,
  skyEnvironmentFragmentShader,
  skyEnvironmentIntensity,
} from "./skyEnvironment";

describe("skyEnvironmentFragmentShader", () => {
  const source = (new Sky().material as ShaderMaterial).fragmentShader;
  const patched = skyEnvironmentFragmentShader(source);

  it("removes the solar disc, which the direct sun light already provides", () => {
    expect(source).toContain("19000.0");
    expect(patched).not.toContain("19000.0");
  });

  it("replaces the sky below the horizon with sea bounce light", () => {
    expect(patched).toContain("uniform vec3 groundAlbedo;");
    expect(patched).toMatch(/groundAlbedo/g);
    expect(patched.indexOf("groundAlbedo, vec3( 1.0 )")).toBeLessThan(
      patched.indexOf("gl_FragColor = vec4( retColor, 1.0 );")
    );
  });

  it("refuses a shader it does not recognise, rather than silently keeping the disc", () => {
    expect(() => skyEnvironmentFragmentShader("void main() {}")).toThrow();
  });
});

describe("skyEnvironmentIntensity", () => {
  it("scales the sky so its irradiance is the clear-sky diffuse share of the sun's", () => {
    // Direct horizontal irradiance 2.5 * sin 35° = 1.434; diffuse share 0.18 of
    // the global total means diffuse = 0.18 / 0.82 of direct = 0.3148.
    const k = skyEnvironmentIntensity({
      measuredSkyIrradiance: 1,
      sunIntensity: 2.5,
      sunElevationDeg: 35,
      diffuseFraction: 0.18,
    });
    expect(k).toBeCloseTo(0.3148, 3);
  });

  it("is inversely proportional to the measured sky irradiance", () => {
    const base = { sunIntensity: 2, sunElevationDeg: 40, diffuseFraction: 0.2 };
    const a = skyEnvironmentIntensity({ ...base, measuredSkyIrradiance: 0.5 });
    const b = skyEnvironmentIntensity({ ...base, measuredSkyIrradiance: 1 });
    expect(a).toBeCloseTo(2 * b, 10);
  });

  it("rejects a non-positive measurement", () => {
    const base = { sunIntensity: 2, sunElevationDeg: 40, diffuseFraction: 0.2 };
    expect(() => skyEnvironmentIntensity({ ...base, measuredSkyIrradiance: 0 })).toThrow(RangeError);
  });
});

describe("relativeLuminance", () => {
  it("uses Rec. 709 weights", () => {
    expect(relativeLuminance(1, 1, 1)).toBeCloseTo(1, 10);
    expect(relativeLuminance(0, 1, 0)).toBeCloseTo(0.7152, 10);
  });
});

describe("cubeUvDefines", () => {
  it("matches three's PMREM layout for a 256-texel-high map", () => {
    // three: maxMip = log2(h) - 2; texelHeight = 1 / h; texelWidth = 1 / (3 * max(2^maxMip, 112)).
    const d = cubeUvDefines(256);
    expect(d.ENVMAP_TYPE_CUBE_UV).toBe("");
    expect(Number(d.CUBEUV_MAX_MIP)).toBe(6);
    expect(d.CUBEUV_MAX_MIP).toContain(".");
    expect(Number(d.CUBEUV_TEXEL_HEIGHT)).toBeCloseTo(1 / 256, 12);
    expect(Number(d.CUBEUV_TEXEL_WIDTH)).toBeCloseTo(1 / 336, 12);
  });

  it("writes every value as a GLSL float literal", () => {
    for (const v of Object.values(cubeUvDefines(1024))) {
      if (v !== "") expect(v).toMatch(/^\d+\.\d+$/);
    }
  });
});
