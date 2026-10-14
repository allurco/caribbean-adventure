import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  parseHexColor,
  themeColors,
  tornEdgeClipPath,
  TORN_EDGE_DEPTH_PX,
} from "./parchment";

describe("parseHexColor", () => {
  it("reads long and short hex", () => {
    expect(parseHexColor("#ff8000")).toEqual([255, 128, 0]);
    expect(parseHexColor("#f80")).toEqual([255, 136, 0]);
  });
  it("rejects anything else", () => {
    expect(parseHexColor("red")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // WebAIM's checker: #767676 on white is 4.54:1.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
  it("is symmetric", () => {
    expect(contrastRatio("#2e1f0f", "#f2e3bf")).toBeCloseTo(contrastRatio("#f2e3bf", "#2e1f0f"), 10);
  });
  it("throws on a colour it cannot read", () => {
    expect(() => contrastRatio("tomato", "#fff")).toThrow(/tomato/);
  });
});

describe("themeColors", () => {
  it("collects the colour tokens with a prefix", () => {
    const css = `@theme {\n  --color-ink: #111;\n  --color-ink-red: #8a1c12;\n  --color-parchment: #f2e3bf;\n  --font-heading: "Cinzel";\n}`;
    expect(themeColors(css, "ink")).toEqual({ ink: "#111", "ink-red": "#8a1c12" });
    expect(themeColors(css, "parchment")).toEqual({ parchment: "#f2e3bf" });
  });
});

describe("tornEdgeClipPath", () => {
  const points = (path: string) => path.replace(/^polygon\(|\)$/g, "").split(/,\s*(?![^(]*\))/);

  it("is the same on every call", () => {
    expect(tornEdgeClipPath()).toBe(tornEdgeClipPath());
  });

  it("runs left to right along the top, then right to left along the bottom", () => {
    const pts = points(tornEdgeClipPath(4, 8, 1));
    expect(pts).toHaveLength(18);
    expect(pts[0]).toMatch(/^0% [\d.]+px$/);
    expect(pts[8]).toMatch(/^100% [\d.]+px$/);
    expect(pts[9]).toMatch(/^100% calc\(100% - [\d.]+px\)$/);
    expect(pts[17]).toMatch(/^0% calc\(100% - [\d.]+px\)$/);
  });

  it("bites no deeper than the depth, and does bite", () => {
    const bites = [...tornEdgeClipPath().matchAll(/(?:% |- )([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(bites.length).toBeGreaterThan(0);
    expect(Math.max(...bites)).toBeLessThanOrEqual(TORN_EDGE_DEPTH_PX);
    expect(Math.max(...bites) - Math.min(...bites)).toBeGreaterThan(1);
  });
});
