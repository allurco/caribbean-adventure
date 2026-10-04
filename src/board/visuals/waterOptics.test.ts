import { describe, it, expect } from "vitest";
import {
  WATER_ABSORPTION,
  WATER_SCATTERING,
  deepWaterReflectance,
  waterTransmittance,
  refractedCosine,
  waterBodyRadiance,
  schlickFresnel,
  shallowSaturationBoost,
  seabedVisibility,
  SEABED_FADE_START,
  SEABED_FADE_END,
  NO_SEABED_DEPTH,
  VISIBLE_SEABED_DEPTH,
  WATER_OPTICS_GLSL,
} from "./waterOptics";

type Rgb = readonly [number, number, number];

/** Clean coral sand bottom reflectance at 650 / 550 / 450 nm (as the palette's seabedSand). */
const SAND: Rgb = [0.564, 0.456, 0.339];

/** Water-body radiance over sand `depth` metres down, seen from straight above with the sun overhead. */
const overSand = (depth: number) =>
  waterBodyRadiance(SAND, deepWaterReflectance(), waterTransmittance(2 * depth));

describe("waterOptics (#38 step 3)", () => {
  describe("coefficients", () => {
    it("uses Pope & Fry (1997) pure-water absorption at 650 / 550 / 450 nm, per metre", () => {
      expect(WATER_ABSORPTION).toEqual([0.34, 0.0565, 0.00922]);
    });

    it("uses Smith & Baker (1981) pure-seawater scattering at 600 / 550 / 450 nm, per metre", () => {
      expect(WATER_SCATTERING).toEqual([0.0014, 0.0019, 0.0045]);
    });
  });

  describe("Beer–Lambert transmittance", () => {
    it("is 1 through no water", () => {
      expect(waterTransmittance(0)).toEqual([1, 1, 1]);
    });

    it("loses red within metres but keeps blue: most red is gone after 10 m, most blue remains", () => {
      const [r, g, b] = waterTransmittance(10);
      expect(r).toBeLessThan(0.15);
      expect(g).toBeGreaterThan(0.5);
      expect(b).toBeGreaterThan(0.85);
    });

    it("multiplies over consecutive paths", () => {
      const a = waterTransmittance(7);
      const b = waterTransmittance(5);
      const ab = waterTransmittance(12);
      for (let i = 0; i < 3; i++) expect(ab[i]).toBeCloseTo(a[i] * b[i], 12);
    });

    it("treats an infinite path as fully opaque", () => {
      expect(waterTransmittance(Infinity)).toEqual([0, 0, 0]);
    });
  });

  describe("deep-water reflectance R∞ = 0.33 · b_b / a (Morel & Prieur 1977)", () => {
    it("is blue, and dark in red and green", () => {
      const [r, g, b] = deepWaterReflectance();
      expect(b).toBeGreaterThan(0.05);
      expect(b).toBeLessThan(0.1);
      expect(g).toBeLessThan(b / 5);
      expect(r).toBeLessThan(g);
    });
  });

  describe("water body over a sand seabed", () => {
    it("is the seabed itself at zero depth", () => {
      expect(overSand(0)).toEqual(SAND);
    });

    it("is turquoise over 3 m of water: green and blue together, far above red", () => {
      const [r, g, b] = overSand(3);
      expect(g).toBeGreaterThan(3 * r);
      expect(b).toBeGreaterThan(3 * r);
      expect(Math.abs(g - b) / Math.max(g, b)).toBeLessThan(0.15);
    });

    it("turns blue by 15 m, the edge of the shelf", () => {
      const [r, g, b] = overSand(15);
      expect(b).toBeGreaterThan(2 * g);
      expect(g).toBeGreaterThan(10 * r);
    });

    it("is the deep-water colour once the seabed is out of reach", () => {
      const deep = deepWaterReflectance();
      const body = overSand(500);
      for (let i = 0; i < 3; i++) expect(body[i]).toBeCloseTo(deep[i], 6);
    });

    it("darkens steadily with depth (no bands)", () => {
      let prev = overSand(0);
      for (let d = 0.25; d <= 60; d += 0.25) {
        const next = overSand(d);
        const lum = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        expect(lum(next)).toBeLessThan(lum(prev));
        prev = next;
      }
    });
  });

  describe("shallow-water saturation boost (stylistic, not physics)", () => {
    it("leaves the bare sand at the waterline alone, is mild over the shelf and gone by 15 m", () => {
      expect(shallowSaturationBoost(0)).toBe(0);
      expect(shallowSaturationBoost(3)).toBeGreaterThan(0.2);
      expect(shallowSaturationBoost(3)).toBeLessThanOrEqual(0.5);
      expect(shallowSaturationBoost(15)).toBe(0);
      expect(shallowSaturationBoost(60)).toBe(0);
    });

    it("fades steadily with depth past the first 2 m", () => {
      let prev = shallowSaturationBoost(2);
      for (let d = 2.5; d <= 15; d += 0.5) {
        expect(shallowSaturationBoost(d)).toBeLessThanOrEqual(prev);
        prev = shallowSaturationBoost(d);
      }
    });
  });

  describe("how deep the seabed stays visible (mesh cut-off)", () => {
    it("fades the seabed out between the fade start and end", () => {
      expect(seabedVisibility(SEABED_FADE_START - 1)).toBeGreaterThan(0.01);
      expect(seabedVisibility(SEABED_FADE_END)).toBe(0);
    });

    it("takes the strongest channel through the shortest path (2 × depth) times the fade", () => {
      const d = 50;
      expect(seabedVisibility(d)).toBeCloseTo(Math.max(...waterTransmittance(2 * d)), 12);
    });

    it("cuts the mesh where the seabed contributes under 1% in every channel, and no shallower", () => {
      expect(seabedVisibility(VISIBLE_SEABED_DEPTH)).toBeLessThanOrEqual(0.01);
      expect(seabedVisibility(VISIBLE_SEABED_DEPTH - 0.5)).toBeGreaterThan(0.01);
      for (let d = VISIBLE_SEABED_DEPTH; d <= 200; d += 0.25) {
        expect(seabedVisibility(d)).toBeLessThanOrEqual(0.01);
      }
      expect(VISIBLE_SEABED_DEPTH).toBeLessThan(SEABED_FADE_END);
    });

    it("puts pixels with no seabed past the fade, where they read as deep water", () => {
      expect(NO_SEABED_DEPTH).toBeGreaterThan(SEABED_FADE_END);
      expect(seabedVisibility(NO_SEABED_DEPTH)).toBe(0);
    });

    it("hands the fade and the no-seabed depth to the shader", () => {
      expect(WATER_OPTICS_GLSL).toContain(`const float SEABED_FADE_START = ${SEABED_FADE_START.toFixed(1)};`);
      expect(WATER_OPTICS_GLSL).toContain(`const float SEABED_FADE_END = ${SEABED_FADE_END.toFixed(1)};`);
      expect(WATER_OPTICS_GLSL).toContain(`const float NO_SEABED_DEPTH = ${NO_SEABED_DEPTH.toFixed(1)};`);
    });
  });

  describe("refraction and Fresnel", () => {
    it("leaves a vertical ray vertical", () => {
      expect(refractedCosine(1)).toBeCloseTo(1, 12);
    });

    it("bends a grazing ray to the critical angle of water (n ≈ 1.333)", () => {
      // sin θc = 1 / 1.333  →  cos θc ≈ 0.661
      expect(refractedCosine(0)).toBeCloseTo(0.661, 3);
    });

    it("reflects 2% at normal incidence and everything at grazing (Schlick, F0 = 0.02)", () => {
      expect(schlickFresnel(1)).toBeCloseTo(0.02, 12);
      expect(schlickFresnel(0)).toBeCloseTo(1, 12);
      // ~5% at a 60° view from vertical, the steep end of the game camera.
      expect(schlickFresnel(Math.cos((60 * Math.PI) / 180))).toBeCloseTo(0.0506, 3);
    });
  });

  describe("GLSL", () => {
    it("declares the same coefficients the TypeScript uses", () => {
      expect(WATER_OPTICS_GLSL).toContain("const vec3 WATER_ABSORPTION = vec3(0.34, 0.0565, 0.00922);");
      expect(WATER_OPTICS_GLSL).toContain("const vec3 WATER_SCATTERING = vec3(0.0014, 0.0019, 0.0045);");
      expect(WATER_OPTICS_GLSL).toContain("vec3 waterTransmittance(float pathMetres)");
      expect(WATER_OPTICS_GLSL).toContain("vec3 deepWaterReflectance()");
      expect(WATER_OPTICS_GLSL).toContain("float refractedCosine(float cosAir)");
      expect(WATER_OPTICS_GLSL).toContain("float schlickFresnel(float cosTheta)");
      expect(WATER_OPTICS_GLSL).toContain("float shallowSaturationBoost(float depthMetres)");
    });
  });
});
