import { describe, expect, it } from "vitest";
import { BUBBLE_FILL, CLOSE_CONTACT_SHARE, CLOSE_FOAM_FAR, CLOSE_FOAM_GLSL, CLOSE_FOAM_NEAR, closeFoamWeight, closeLace, closeShipFoamShares, closeUpFoam } from "./closeFoam";
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

describe("closeUpFoam", () => {
  it("leaves the foam exactly as it was at weight 0, whatever the bubbles", () => {
    for (const foam of [0, 0.2, 0.6, 1]) for (const cell of [0, 0.3, 1]) expect(closeUpFoam(foam, cell, 0)).toBe(foam);
  });

  it("breaks even solid foam into bubbles with water between them up close", () => {
    expect(closeUpFoam(1, 1, 1)).toBe(1); // a bubble's middle
    expect(closeUpFoam(1, 0, 1)).toBe(0); // the water between cells
    expect(closeUpFoam(1, 0.05, 1)).toBeLessThan(0.05);
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

  it("never brightens the foam", () => {
    for (const foam of [0.1, 0.4, 0.8]) for (const cell of [0, 0.5, 1]) expect(closeUpFoam(foam, cell, 1)).toBeLessThanOrEqual(foam + 1e-12);
  });
});

describe("closeShipFoamShares", () => {
  it("keeps the hull's patch and contact line whole from the ship view out", () => {
    expect(closeShipFoamShares(0)).toEqual({ patch: 1, contact: 1 });
  });

  it("drops the patch and thins the contact line up close, where the flecks take over", () => {
    const close = closeShipFoamShares(1);
    expect(close.patch).toBe(0);
    expect(close.contact).toBe(CLOSE_CONTACT_SHARE);
    expect(CLOSE_CONTACT_SHARE).toBeGreaterThan(0); // the hull still sits in the water
    expect(CLOSE_CONTACT_SHARE).toBeLessThan(0.7); // a line, not a white rim
  });
});

describe("CLOSE_FOAM_GLSL", () => {
  it("mirrors the constants and declares what the water and the sand call", () => {
    expect(CLOSE_FOAM_GLSL).toContain(`CLOSE_FOAM_NEAR = ${CLOSE_FOAM_NEAR.toFixed(4)}`);
    expect(CLOSE_FOAM_GLSL).toContain(`BUBBLE_FILL = ${BUBBLE_FILL.toFixed(4)}`);
    expect(CLOSE_FOAM_GLSL).toContain(`CLOSE_CONTACT_SHARE = ${CLOSE_CONTACT_SHARE.toFixed(4)}`);
    for (const name of ["float closeFoamWeight(", "float foamBubbleCell(", "float closeUpFoam("]) expect(CLOSE_FOAM_GLSL).toContain(name);
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
