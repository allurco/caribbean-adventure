import { describe, expect, it } from "vitest";
import { BUBBLE_CONE_FILL, CLOSE_PATCH_RESIDUE, CLOSE_FOAM_FAR, CLOSE_FOAM_GLSL, CLOSE_FOAM_NEAR, closeFoamWeight, closeLace, closeShipFoamShares, closeBubbleWeight, closeUpFoam, foamBubbleCell, withContactLine, BUBBLE_METRES, BUBBLE_SMALL_RATIO } from "./closeFoam";
import { foamLace } from "./foamShading";

describe("closeFoamWeight", () => {
  it("is full when the camera is in close, and nothing from the opening ship view (3.4) out", () => {
    expect(closeFoamWeight(1.0)).toBe(1);
    expect(closeFoamWeight(CLOSE_FOAM_NEAR)).toBe(1);
    expect(closeFoamWeight(CLOSE_FOAM_FAR)).toBe(0);
    expect(closeFoamWeight(3.4)).toBe(0);
    expect(closeFoamWeight(26)).toBe(0);
    expect(CLOSE_FOAM_FAR).toBeLessThan(3.4);
  });

  it("eases in between, closer is more", () => {
    const mid = closeFoamWeight((CLOSE_FOAM_NEAR + CLOSE_FOAM_FAR) / 2);
    expect(mid).toBeCloseTo(0.5, 6);
    expect(closeFoamWeight(CLOSE_FOAM_NEAR + 0.1)).toBeGreaterThan(closeFoamWeight(CLOSE_FOAM_FAR - 0.1));
  });
});

/** The bubble field sampled at `n` seeded points of a 200 m square, at no churn. */
function bubbleCells(n: number): number[] {
  let s = 12345;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, () => foamBubbleCell(random() * 3, random() * 3, 0, 0, 65));
}
const CELLS = bubbleCells(40000);
const meanOver = (f: (cell: number, i: number) => number) => CELLS.reduce((sum, c, i) => sum + f(c, i), 0) / CELLS.length;

describe("foamBubbleCell", () => {
  it("is 1 at a bubble's middle and 0 between, and most of the sea lies in some bubble", () => {
    expect(Math.max(...CELLS)).toBeGreaterThan(0.97);
    expect(Math.min(...CELLS)).toBe(0);
    const inside = CELLS.filter((c) => c > 0).length / CELLS.length;
    expect(inside).toBeGreaterThan(0.85);
    expect(inside).toBeLessThan(1);
  });
});

describe("closeUpFoam", () => {
  it("keeps the foam's amount: its mean over the bubbles is the foam's, within 10%, thin or dense", () => {
    for (const foam of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
      const mean = meanOver((cell) => closeUpFoam(foam, cell, 1));
      expect(Math.abs(mean - foam) / foam, `foam ${foam}: mean ${mean.toFixed(3)}`).toBeLessThan(0.1);
    }
  });

  it("leaves the foam exactly as it was at weight 0, whatever the bubbles", () => {
    for (const foam of [0, 0.2, 0.6, 1]) for (const cell of [0, 0.3, 1]) expect(closeUpFoam(foam, cell, 0)).toBe(foam);
  });

  it("breaks dense foam into packed white bubbles with water between them, and keeps solid foam solid", () => {
    expect(closeUpFoam(0.7, 1, 1)).toBe(1); // a bubble's middle
    expect(closeUpFoam(0.7, 0, 1)).toBe(0); // the water between cells
    expect(closeUpFoam(1, 0, 1)).toBe(1);
  });

  it("is fewer bubbles as the foam thins, and none where there is no foam", () => {
    const kept = (foam: number) => {
      let n = 0;
      for (let i = 0; i <= 100; i++) n += closeUpFoam(foam, i / 100, 1) > 0.5 * foam ? 1 : 0;
      return n;
    };
    expect(kept(1)).toBeGreaterThan(kept(0.5));
    expect(kept(0.5)).toBeGreaterThan(kept(0.15));
    expect(kept(0)).toBe(0);
  });

  it("gathers the bubbles where the cluster noise is high and thins them where it is low, keeping the amount", () => {
    for (const foam of [0.2, 0.5, 0.8]) {
      const high = meanOver((cell) => closeUpFoam(foam, cell, 1, 1));
      const low = meanOver((cell) => closeUpFoam(foam, cell, 1, -1));
      expect(high).toBeGreaterThan(foam * 1.05);
      expect(low).toBeLessThan(foam * 0.95);
      // Over a cluster noise of mean 0 the foam's amount is kept.
      const mixed = meanOver((cell, i) => closeUpFoam(foam, cell, 1, ((i % 21) - 10) / 10));
      expect(Math.abs(mixed - foam) / foam, `foam ${foam}`).toBeLessThan(0.1);
    }
  });

  it("opens water between the bubbles even in solid foam where the cluster noise is low, so a wake's core is not a white ribbon", () => {
    expect(closeUpFoam(1, 0, 1, -1)).toBeLessThan(0.5);
    expect(closeUpFoam(1, 1, 1, -1)).toBe(1);
    const mixed = meanOver((cell, i) => closeUpFoam(1, cell, 1, ((i % 21) - 10) / 10));
    expect(mixed).toBeGreaterThan(0.9);
  });

  it("draws the bubbles white, thin foam as a few of them, not as grey dust", () => {
    for (const foam of [0.1, 0.3, 0.6]) {
      const lit = CELLS.map((c) => closeUpFoam(foam, c, 1)).filter((v) => v > 0.02);
      // Most of what is drawn is near-full white, whatever the foam's level.
      expect(lit.filter((v) => v > 0.9).length / lit.length, `foam ${foam}`).toBeGreaterThan(0.5);
    }
  });
});

describe("closeBubbleWeight", () => {
  const small = BUBBLE_METRES * BUBBLE_SMALL_RATIO;
  it("follows the close-up weight, ramped up, where the bubbles span many pixels", () => {
    expect(closeBubbleWeight(1, small / 20)).toBe(1);
    expect(closeBubbleWeight(0.1, small / 20)).toBeGreaterThan(0.1);
    expect(closeBubbleWeight(0.1, small / 20)).toBeLessThan(1);
  });

  it("comes in fully well before the close-up weight does, so the zoom between does not draw a grey mix of foam and bubbles", () => {
    expect(closeBubbleWeight(closeFoamWeight(2.3), small / 20)).toBe(1);
    expect(closeBubbleWeight(closeFoamWeight(2.7), small / 20)).toBeGreaterThan(0);
    expect(closeBubbleWeight(closeFoamWeight(2.7), small / 20)).toBeLessThan(0.2);
  });

  it("fades the bubbles out where they would be a pixel or two, so the far part of a close frame does not sparkle", () => {
    expect(closeBubbleWeight(1, small)).toBe(0);
    expect(closeBubbleWeight(1, small / 3)).toBeGreaterThan(0);
    expect(closeBubbleWeight(1, small / 3)).toBeLessThan(1);
  });

  it("is exactly 0 wherever the close-up weight is, from the ship view out", () => {
    for (const footprint of [0.001, 0.05, 1]) expect(closeBubbleWeight(closeFoamWeight(CLOSE_FOAM_FAR), footprint)).toBe(0);
  });
});

describe("closeShipFoamShares", () => {
  it("keeps the hull's patch and contact line whole from the ship view out", () => {
    expect(closeShipFoamShares(0)).toEqual({ patch: 1, contact: 1 });
  });

  it("keeps the contact line whole up close, and fades the patch to a thin residue, not to nothing", () => {
    const close = closeShipFoamShares(1);
    expect(close.contact).toBe(1);
    expect(close.patch).toBe(CLOSE_PATCH_RESIDUE);
    expect(CLOSE_PATCH_RESIDUE).toBeGreaterThan(0.1); // the hull still sits in stirred water
    expect(CLOSE_PATCH_RESIDUE).toBeLessThan(0.4); // a residue, not the white patch of #389
  });
});

describe("withContactLine", () => {
  it("leaves the foam exactly as it was at weight 0", () => {
    for (const foam of [0, 0.1, 0.37, 1]) expect(withContactLine(foam, 1, 0)).toBe(foam);
  });

  it("lays the hull's contact line over the bubbled foam up close, so the waterline stays white", () => {
    expect(withContactLine(0, 1, 1)).toBe(1);
    expect(withContactLine(0.3, 0.8, 1)).toBeCloseTo(1 - 0.7 * 0.2, 12);
    expect(withContactLine(0.3, 0, 1)).toBeCloseTo(0.3, 12);
    expect(withContactLine(0, 1, 0.5)).toBeCloseTo(0.5, 12);
  });
});

describe("CLOSE_FOAM_GLSL", () => {
  it("mirrors the constants and declares what the water and the sand call", () => {
    expect(CLOSE_FOAM_GLSL).toContain(`CLOSE_FOAM_NEAR = ${CLOSE_FOAM_NEAR.toFixed(4)}`);
    expect(CLOSE_FOAM_GLSL).toContain(`BUBBLE_CONE_FILL = ${BUBBLE_CONE_FILL.toFixed(4)}`);
    expect(CLOSE_FOAM_GLSL).toContain(`CLOSE_PATCH_RESIDUE = ${CLOSE_PATCH_RESIDUE.toFixed(4)}`);
    for (const name of ["float closeFoamWeight(", "float foamBubbleCell(", "float closeUpFoam(float foam, float cell, float weight, float cluster)"]) expect(CLOSE_FOAM_GLSL).toContain(name);
  });

  it("mirrors the bubbles, the softened lace and the ship's shares expression for expression", () => {
    expect(CLOSE_FOAM_GLSL).toContain("if (weight <= 0.0 || foam <= 0.0) return foam;");
    expect(CLOSE_FOAM_GLSL).toContain("float perOctave = 1.0 - sqrt(1.0 - clamp(foam, 0.0, 1.0));");
    expect(CLOSE_FOAM_GLSL).toContain("return 1.0 - sqrt(perOctave / BUBBLE_CONE_FILL);");
    expect(CLOSE_FOAM_GLSL).toContain("float level = min(1.0, f * (1.0 + BUBBLE_CLUSTER * cluster * (1.0 - BUBBLE_CLUSTER_DENSE * f)));");
    expect(CLOSE_FOAM_GLSL).toContain("float edge = 0.5 * BUBBLE_SOFTNESS * (1.0 - threshold);");
    expect(CLOSE_FOAM_GLSL).toContain("float bubbles = smoothstep(threshold - edge, threshold + edge, cell);");
    expect(CLOSE_FOAM_GLSL).toContain("float bubbled = bubbles + (1.0 - bubbles) * smoothstep(BUBBLE_GAP_FROM, 1.0, level);");
    expect(CLOSE_FOAM_GLSL).toContain("return mix(foam, bubbled, min(weight, 1.0));");
    expect(CLOSE_FOAM_GLSL).toContain("if (weight <= 0.0 || coverage <= 0.0) return foamLace(coverage, noise);");
    expect(CLOSE_FOAM_GLSL).toContain("float widen = CLOSE_LACE_SOFTENING * min(weight, 1.0);");
    expect(CLOSE_FOAM_GLSL).toContain("return smoothstep(threshold - 0.5 * widen, threshold + FOAM_LACE_SOFTNESS + 0.5 * widen, noise);");
    expect(CLOSE_FOAM_GLSL).toContain("if (closeUp <= 0.0) return 0.0;");
    expect(CLOSE_FOAM_GLSL).toContain("return min(closeUp * CLOSE_BUBBLE_GAIN, 1.0) * foamDetailFade(footprintMetres, BUBBLE_METRES * BUBBLE_SMALL_RATIO);");
    expect(CLOSE_FOAM_GLSL).toContain("vec2 closeShipFoamShares(float weight)");
    expect(CLOSE_FOAM_GLSL).toContain("return vec2(mix(1.0, CLOSE_PATCH_RESIDUE, w), 1.0);");
    expect(CLOSE_FOAM_GLSL).toContain("float withContactLine(float foam, float contact, float weight)");
    expect(CLOSE_FOAM_GLSL).toContain("return 1.0 - (1.0 - foam) * (1.0 - contact * min(weight, 1.0));");
  });

  it("names every number of the bubble field", () => {
    const body = CLOSE_FOAM_GLSL.slice(CLOSE_FOAM_GLSL.indexOf("float bubbleOctave("), CLOSE_FOAM_GLSL.indexOf("float closeUpFoam("));
    // Only 0, 1 and the loop bounds are written as literals; the rest are named constants.
    const literals = body.match(/\b\d+\.\d+\b/g) ?? [];
    expect([...new Set(literals)].sort()).toEqual(["0.0", "1.0"]);
  });
});

describe("closeLace", () => {
  it("is the foam's own lace at weight 0", () => {
    for (const c of [0, 0.3, 0.8]) for (const n of [0, 0.4, 0.7, 1]) expect(closeLace(c, n, 0)).toBe(foamLace(c, n));
  });

  it("softens the lace's edge up close, so the bubbles thin out toward it instead of stopping at a hard rim", () => {
    // Just inside the lace's edge it is no longer solid, and just outside it no longer nothing.
    const c = 0.5;
    const threshold = 1 - c;
    expect(closeLace(c, threshold + 0.2, 1)).toBeLessThan(foamLace(c, threshold + 0.2));
    expect(closeLace(c, threshold - 0.05, 1)).toBeGreaterThan(0);
    expect(closeLace(0, 0.9, 1)).toBe(0);
  });
});
