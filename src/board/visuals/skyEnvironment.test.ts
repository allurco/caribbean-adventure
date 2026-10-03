import { describe, expect, it } from "vitest";
import type { ShaderMaterial } from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import {
  cubeUvDefines,
  downwardViewFactor,
  groundBounceRadiance,
  relativeLuminance,
  seaBounceAlbedo,
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

  it("replaces the sky below the horizon with the sea's radiance", () => {
    expect(patched).toContain("uniform vec3 groundRadiance;");
    expect(patched.indexOf("mix( groundRadiance, retColor")).toBeGreaterThan(0);
    expect(patched.indexOf("mix( groundRadiance, retColor")).toBeLessThan(
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

describe("groundBounceRadiance", () => {
  it("is albedo × (direct + diffuse) / π, in the map's raw units", () => {
    // direct 1.434, f = 0.18 → global 1.749; ρ = 0.2 → 0.2 × 1.749 / π = 0.1113;
    // raw = scene / environmentIntensity (0.5) = 0.2227.
    const [r, g, b] = groundBounceRadiance({
      albedo: [0.2, 0.1, 0],
      directHorizontal: 1.434,
      diffuseFraction: 0.18,
      environmentIntensity: 0.5,
    });
    expect(r).toBeCloseTo(0.2227, 3);
    expect(g).toBeCloseTo(r / 2, 10);
    expect(b).toBe(0);
  });
});

describe("downwardViewFactor", () => {
  it("is the share of a level-facing-down point's view taken by a disc below it", () => {
    // Disc of radius R seen from height h: R² / (R² + h²).
    expect(downwardViewFactor(1, 1)).toBeCloseTo(0.5, 10);
    expect(downwardViewFactor(1, 3)).toBeCloseTo(0.9, 10);
  });

  it("is everything at ground level and nothing for a vanishing disc", () => {
    expect(downwardViewFactor(0, 1)).toBe(1);
    expect(downwardViewFactor(1, 0)).toBe(0);
  });
});

describe("seaBounceAlbedo", () => {
  const shallow: [number, number, number] = [0.12, 0.3, 0.3];
  const deep: [number, number, number] = [0.04, 0.07, 0.08];

  it("blends shallow and deep water by the share of the view the shallows fill", () => {
    const a = seaBounceAlbedo(shallow, deep, 0.5);
    expect(a[0]).toBeCloseTo(0.08, 10);
    expect(a[1]).toBeCloseTo(0.185, 10);
    expect(a[2]).toBeCloseTo(0.19, 10);
  });

  it("is the pure colours at the ends", () => {
    expect(seaBounceAlbedo(shallow, deep, 1)).toEqual(shallow);
    expect(seaBounceAlbedo(shallow, deep, 0)).toEqual(deep);
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
