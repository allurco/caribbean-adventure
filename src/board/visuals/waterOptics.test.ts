import { describe, it, expect } from "vitest";
import {
  WATER_ABSORPTION,
  WATER_SCATTERING,
  deepWaterReflectance,
  waterTransmittance,
  refractedCosine,
  waterBodyRadiance,
  schlickFresnel,
  WATER_OPTICS_GLSL,
} from "./waterOptics";

type Rgb = readonly [number, number, number];

/** Clean coral sand bottom reflectance at 600 / 550 / 450 nm (as the palette's seabedSand). */
const SAND: Rgb = [0.518, 0.456, 0.339];

/** Water-body radiance over sand `depth` metres down, seen from straight above with the sun overhead. */
const overSand = (depth: number) =>
  waterBodyRadiance(SAND, deepWaterReflectance(), waterTransmittance(2 * depth));

describe("waterOptics (#38 step 3)", () => {
  describe("coefficients", () => {
    it("uses Pope & Fry (1997) pure-water absorption at 600 / 550 / 450 nm, per metre", () => {
      expect(WATER_ABSORPTION).toEqual([0.2224, 0.0565, 0.00922]);
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

    it("is turquoise over 3 m of water: green and blue together, well above red", () => {
      const [r, g, b] = overSand(3);
      expect(g).toBeGreaterThan(2 * r);
      expect(b).toBeGreaterThan(2 * r);
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
      expect(WATER_OPTICS_GLSL).toContain("const vec3 WATER_ABSORPTION = vec3(0.2224, 0.0565, 0.00922);");
      expect(WATER_OPTICS_GLSL).toContain("const vec3 WATER_SCATTERING = vec3(0.0014, 0.0019, 0.0045);");
      expect(WATER_OPTICS_GLSL).toContain("vec3 waterTransmittance(float pathMetres)");
      expect(WATER_OPTICS_GLSL).toContain("vec3 deepWaterReflectance()");
      expect(WATER_OPTICS_GLSL).toContain("float refractedCosine(float cosAir)");
      expect(WATER_OPTICS_GLSL).toContain("float schlickFresnel(float cosTheta)");
    });
  });
});
