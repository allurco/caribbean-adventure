import { describe, it, expect } from "vitest";
import {
  SHRUB_COLOR_HEX,
  SHRUB_HEIGHT_RANGE,
  SHRUB_HUE_SPREAD,
  SHRUB_TINT_SPREAD,
  SHRUB_WIDTH_RANGE,
  shrubVariation,
  type ShrubPlacement,
} from "./shrubVariation";
import { SHRUB_KINDS } from "./shrubGeometry";
import { PALETTE_HEX } from "./palette";

const TAU = Math.PI * 2;

/** Relative luminance of an sRGB hex, good enough to order colours by brightness. */
function luminance(hex: number): number {
  const channel = (shift: number) => ((hex >> shift) & 0xff) / 255;
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}
const red = (hex: number) => (hex >> 16) & 0xff;
const green = (hex: number) => (hex >> 8) & 0xff;
const blue = (hex: number) => hex & 0xff;

function placement(i: number): ShrubPlacement {
  return {
    kind: SHRUB_KINDS[i % 2],
    worldX: Math.cos(i * 1.3) * 7 + i * 0.11,
    worldY: 0.3,
    worldZ: Math.sin(i * 0.7) * 5 - i * 0.05,
    rotation: (i * 2.39996) % TAU,
    scale: 0.8 + (i % 7) * 0.07,
  };
}

const shrubs = Array.from({ length: 300 }, (_, i) => placement(i));
const variations = shrubs.map((s) => shrubVariation(s));

describe("SHRUB_COLOR_HEX", () => {
  it("has a stem and a foliage colour per kind", () => {
    for (const kind of SHRUB_KINDS) {
      expect(SHRUB_COLOR_HEX[kind].stem).toBeGreaterThanOrEqual(0);
      expect(SHRUB_COLOR_HEX[kind].foliage).toBeGreaterThanOrEqual(0);
    }
  });

  it("makes bush leaves a green clearly lighter than the jungle floor they stand on", () => {
    const leaf = SHRUB_COLOR_HEX.bush.foliage;
    expect(luminance(leaf)).toBeGreaterThan(1.3 * luminance(PALETTE_HEX.jungle));
    expect(green(leaf)).toBeGreaterThan(red(leaf));
    expect(red(leaf)).toBeGreaterThan(blue(leaf));
  });

  it("keeps bush leaves apart from the palm fronds: warmer and lighter", () => {
    const leaf = SHRUB_COLOR_HEX.bush.foliage;
    expect(luminance(leaf)).toBeGreaterThan(luminance(PALETTE_HEX.palmFrond));
    expect(red(leaf) / green(leaf)).toBeGreaterThan(red(PALETTE_HEX.palmFrond) / green(PALETTE_HEX.palmFrond));
  });

  it("uses the palm trunk colour for the bush stem", () => {
    expect(SHRUB_COLOR_HEX.bush.stem).toBe(PALETTE_HEX.palmTrunk);
  });

  it("makes tuft blades a dry olive straw: darker than the beach and greener than it", () => {
    const blade = SHRUB_COLOR_HEX.tuft.foliage;
    expect(luminance(blade)).toBeLessThan(0.85 * luminance(PALETTE_HEX.drySand));
    expect(luminance(blade)).toBeGreaterThan(0.5 * luminance(PALETTE_HEX.drySand));
    expect(green(blade) / red(blade)).toBeGreaterThan(green(PALETTE_HEX.drySand) / red(PALETTE_HEX.drySand));
    // Still pale: more green than blue, so it reads as straw rather than grass.
    expect(green(blade)).toBeGreaterThan(blue(blade) * 1.4);
  });

  it("makes the tuft's mound darker than its blades", () => {
    expect(luminance(SHRUB_COLOR_HEX.tuft.stem)).toBeLessThan(luminance(SHRUB_COLOR_HEX.tuft.foliage));
  });
});

describe("shrubVariation", () => {
  it("is deterministic for the same input", () => {
    expect(shrubVariation(shrubs[5])).toEqual(shrubVariation({ ...shrubs[5] }));
  });

  it("keeps the placement's kind", () => {
    shrubs.forEach((s, i) => expect(variations[i].kind).toBe(s.kind));
  });

  it("faces each shrub along its placement rotation", () => {
    shrubs.forEach((s, i) => expect(variations[i].yaw).toBe(s.rotation));
  });

  it("stretches width and height separately, each within its range, keeping the footprint round", () => {
    shrubs.forEach((s, i) => {
      const [x, y, z] = variations[i].scale;
      expect(x).toBe(z);
      expect(x).toBeGreaterThanOrEqual(s.scale * SHRUB_WIDTH_RANGE[0] - 1e-9);
      expect(x).toBeLessThanOrEqual(s.scale * SHRUB_WIDTH_RANGE[1] + 1e-9);
      expect(y).toBeGreaterThanOrEqual(s.scale * SHRUB_HEIGHT_RANGE[0] - 1e-9);
      expect(y).toBeLessThanOrEqual(s.scale * SHRUB_HEIGHT_RANGE[1] + 1e-9);
    });
    const squat = variations.filter((v) => Math.abs(v.scale[0] - v.scale[1]) > 0.02 * v.scale[0]);
    expect(squat.length).toBeGreaterThan(variations.length / 2);
  });

  it("tints each channel within the luminance spread plus the hue nudge, around 1", () => {
    const limit = SHRUB_TINT_SPREAD + SHRUB_HUE_SPREAD;
    for (const v of variations) {
      for (const channel of v.tint) {
        expect(channel).toBeGreaterThanOrEqual(1 - limit - 1e-9);
        expect(channel).toBeLessThanOrEqual(1 + limit + 1e-9);
      }
      // The hue nudge moves green against red and blue, never red against blue.
      expect(v.tint[0]).toBeCloseTo(v.tint[2], 9);
    }
    const greens = variations.map((v) => v.tint[1]);
    expect(Math.max(...greens) - Math.min(...greens)).toBeGreaterThan(SHRUB_TINT_SPREAD);
  });

  it("keeps the spreads modest so a grove stays one palette", () => {
    expect(SHRUB_TINT_SPREAD).toBeLessThanOrEqual(0.15);
    expect(SHRUB_HUE_SPREAD).toBeLessThanOrEqual(0.08);
  });

  it("gives each shrub a sway phase in [0, 2π)", () => {
    for (const v of variations) {
      expect(v.phase).toBeGreaterThanOrEqual(0);
      expect(v.phase).toBeLessThan(TAU);
    }
    const phases = variations.map((v) => v.phase);
    expect(Math.max(...phases) - Math.min(...phases)).toBeGreaterThan(Math.PI);
  });

  it("varies between neighbouring shrubs", () => {
    const a = shrubVariation(shrubs[10]);
    const b = shrubVariation({ ...shrubs[10], worldX: shrubs[10].worldX + 0.05 });
    expect(a.tint[1]).not.toBeCloseTo(b.tint[1], 3);
    expect(a.scale[1]).not.toBeCloseTo(b.scale[1], 3);
    expect(a.phase).not.toBeCloseTo(b.phase, 3);
  });
});
