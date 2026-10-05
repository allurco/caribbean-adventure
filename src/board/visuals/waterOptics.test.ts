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
  deepWaterLiftWeight,
  liftedDeepWaterReflectance,
  SEABED_FADE_START,
  SEABED_FADE_END,
  NO_SEABED_DEPTH,
  VISIBLE_SEABED_DEPTH,
  WATER_OPTICS_GLSL,
  refractedDirection,
  MAX_REFRACTED_TRAVEL,
  facetSunlight,
} from "./waterOptics";

type Rgb = readonly [number, number, number];

describe("facetSunlight", () => {
  const sun = [0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)] as const; // 45° up toward +z

  it("is 1 under a level surface", () => {
    expect(facetSunlight([0, 1, 0], sun)).toBeCloseTo(1, 12);
  });

  it("is (n·l) / (n_y · l_y): a facet tilted 10° toward the sun takes more light", () => {
    const t = (10 * Math.PI) / 180;
    const n = [0, Math.cos(t), Math.sin(t)] as const;
    // cos(35°) / (cos 10° · sin 45°) ≈ 1.176
    expect(facetSunlight(n, sun)).toBeCloseTo(1.176, 3);
  });

  it("is 0 on a facet turned away from the sun", () => {
    const n = [0, Math.cos(1), -Math.sin(1)] as const;
    expect(facetSunlight(n, sun)).toBe(0);
  });
});

describe("refractedDirection (vector Snell, air into water)", () => {
  const UP = [0, 1, 0] as const;

  it("leaves a vertical ray vertical", () => {
    const r = refractedDirection([0, -1, 0], UP);
    expect(r[0]).toBeCloseTo(0, 12);
    expect(r[1]).toBeCloseTo(-1, 12);
    expect(r[2]).toBeCloseTo(0, 12);
  });

  it("bends a ray 35° from vertical to 25.5° (sin 35° / 1.333), staying in its plane", () => {
    const t = (35 * Math.PI) / 180;
    const r = refractedDirection([Math.sin(t), -Math.cos(t), 0], UP);
    const refracted = Math.asin(Math.sin(t) / 1.333);
    expect(Math.hypot(...r)).toBeCloseTo(1, 12);
    expect(r[0]).toBeCloseTo(Math.sin(refracted), 6);
    expect(r[1]).toBeCloseTo(-Math.cos(refracted), 6);
    expect(r[2]).toBe(0);
  });

  it("bends a grazing ray to the critical angle, 48.6° from vertical", () => {
    const r = refractedDirection([1, -1e-9, 0], UP);
    expect(Math.atan2(r[0], -r[1])).toBeCloseTo(Math.asin(1 / 1.333), 4);
  });

  it("refracts about the facet normal, not the vertical: a vertical ray through a tilted facet bends toward the tilt", () => {
    // Facet of slope 0.1 along x, normal (−0.1, 1, 0) normalised. To first
    // order the refracted ray leaves at (1 − 1/n) · slope horizontal per unit
    // down (the overhead-sun entry of the caustic focus matrix, causticFocus.ts).
    const n = 1 / Math.hypot(0.1, 1);
    const r = refractedDirection([0, -1, 0], [-0.1 * n, n, 0]);
    expect(r[0] / -r[1]).toBeCloseTo((1 - 1 / 1.333) * 0.1, 3);
  });
});

describe("MAX_REFRACTED_TRAVEL", () => {
  it("is the horizontal travel per unit depth of a ray at the critical angle, tan(asin(1/n)) ≈ 1.135", () => {
    expect(MAX_REFRACTED_TRAVEL).toBeCloseTo(Math.tan(Math.asin(1 / 1.333)), 9);
    expect(MAX_REFRACTED_TRAVEL).toBeCloseTo(1.135, 3);
  });

  it("is in the shader", () => {
    expect(WATER_OPTICS_GLSL).toContain(`const float MAX_REFRACTED_TRAVEL = ${MAX_REFRACTED_TRAVEL.toFixed(6)};`);
  });
});

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

    it("boosts only the water's tint, not the sand seen through it (#38)", () => {
      // Saturating clear water over sand turned the sand orange: a warm halo at
      // every waterline. The boost scales with the share of red the water has
      // taken out (1 − red transmittance).
      expect(shallowSaturationBoost(3, 1)).toBe(0);
      expect(shallowSaturationBoost(3, 0.5)).toBeCloseTo(0.5 * shallowSaturationBoost(3), 12);
      expect(shallowSaturationBoost(3, 0)).toBe(shallowSaturationBoost(3));
    });

    it("fades steadily with depth past the first 2 m", () => {
      let prev = shallowSaturationBoost(2);
      for (let d = 2.5; d <= 15; d += 0.5) {
        expect(shallowSaturationBoost(d)).toBeLessThanOrEqual(prev);
        prev = shallowSaturationBoost(d);
      }
    });
  });

  describe("deep-water lift (stylistic, not physics)", () => {
    const lum = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

    it("leaves the inner shelf alone, eases in from 5 m and is full past the drop-off", () => {
      for (let d = 0; d <= 5; d += 0.5) expect(deepWaterLiftWeight(d)).toBe(0);
      // Still faint on the outer shelf (accepted overlap with the shallow boost).
      expect(deepWaterLiftWeight(8)).toBeLessThan(0.15);
      expect(deepWaterLiftWeight(15)).toBeGreaterThan(0);
      expect(deepWaterLiftWeight(15)).toBeLessThan(1);
      // Full by the top of the drop-off, so the wall is no darker than open water.
      expect(deepWaterLiftWeight(20)).toBe(1);
      expect(deepWaterLiftWeight(NO_SEABED_DEPTH)).toBe(1);
    });

    it("ramps in steadily with depth", () => {
      let prev = 0;
      for (let d = 5; d <= 30; d += 0.25) {
        expect(deepWaterLiftWeight(d)).toBeGreaterThanOrEqual(prev);
        prev = deepWaterLiftWeight(d);
      }
    });

    it("makes deep water a rich blue, not cyan: blue well above green, green above red", () => {
      const [r, g, b] = liftedDeepWaterReflectance(1);
      expect(b).toBeGreaterThan(2 * g);
      expect(g).toBeGreaterThan(r);
    });

    it("is brighter than the physical R∞ but stays darker than the shelf over sand", () => {
      expect(lum(liftedDeepWaterReflectance(1))).toBeGreaterThan(2 * lum(deepWaterReflectance()));
      // Rendered (close view) it is far darker still: sRGB green 56 vs 131 on the shelf.
      expect(lum(liftedDeepWaterReflectance(1))).toBeLessThan(0.75 * lum(overSand(5)));
      expect(liftedDeepWaterReflectance(0)).toEqual(deepWaterReflectance());
    });

    it("darkens steadily from shelf to open water, with no ring darker than open water (#38)", () => {
      // The shader's water body seen from straight above with the sun overhead,
      // over the seabed albedos (sand, blending to the deep seabed 10–30 m down),
      // under warm downwelling light; the lift is added on top.
      const seabedSand: Rgb = [0.564, 0.456, 0.339];
      const deepSeabed: Rgb = [0.3515, 0.3625, 0.197];
      const downwelling: Rgb = [0.75, 0.56, 0.45];
      const ss = (a: number, b: number, x: number) => {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };
      const bodyLum = (d: number) => {
        const k = ss(10, 30, d);
        const albedo = seabedSand.map((s, i) => s + (deepSeabed[i] - s) * k) as unknown as Rgb;
        const fade = 1 - ss(SEABED_FADE_START, SEABED_FADE_END, d);
        const t = waterTransmittance(2 * d).map((v) => v * fade) as unknown as Rgb;
        const base = waterBodyRadiance(albedo, deepWaterReflectance(), t);
        const lifted = liftedDeepWaterReflectance(deepWaterLiftWeight(d));
        const physical = deepWaterReflectance();
        return lum(base.map((v, i) => (v + lifted[i] - physical[i]) * downwelling[i]) as unknown as Rgb);
      };
      const open = bodyLum(NO_SEABED_DEPTH);
      let runMin = Infinity;
      for (let d = 0; d <= NO_SEABED_DEPTH; d += 0.25) {
        const v = bodyLum(d);
        expect(v).toBeGreaterThanOrEqual(0.98 * open);
        // Walking out to sea it may only brighten again by a hair (no light ring either).
        expect(v - runMin).toBeLessThan(0.08 * open);
        runMin = Math.min(runMin, v);
      }
    });

    it("is in the shader too", () => {
      expect(WATER_OPTICS_GLSL).toContain("float deepWaterLiftWeight(float depthMetres)");
      expect(WATER_OPTICS_GLSL).toContain("vec3 liftedDeepWaterReflectance(float weight)");
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
      expect(WATER_OPTICS_GLSL).toContain("float shallowSaturationBoost(float depthMetres, float redTransmittance)");
    });
  });
});
