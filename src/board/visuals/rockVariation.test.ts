import { describe, it, expect } from "vitest";
import type { Biome } from "../../game/types";
import {
  ROCK_BASE_COLOR,
  ROCK_BURY_RANGE,
  ROCK_SIZE_CLASS_SCALE,
  ROCK_STRETCH_RANGE,
  ROCK_TILT_RANGE,
  ROCK_TINT_SPREAD,
  rockSizeClass,
  rockVariation,
  type RockPlacement,
} from "./rockVariation";
import { ROCK_VARIANT_COUNT } from "./rockGeometry";
import { PALETTE_HEX } from "./palette";

const BIOMES: readonly Biome[] = ["SAND", "GRASS", "ROCK"];

/** Relative luminance of an sRGB hex, good enough to order colours by brightness. */
function luminance(hex: number): number {
  const channel = (shift: number) => ((hex >> shift) & 0xff) / 255;
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** Largest difference between two channels of an sRGB hex (0 for a pure grey). */
function chroma(hex: number): number {
  const channels = [16, 8, 0].map((shift) => (hex >> shift) & 0xff);
  return Math.max(...channels) - Math.min(...channels);
}

function placement(i: number, biome: Biome | undefined = BIOMES[i % 3]): RockPlacement {
  return {
    worldX: Math.cos(i * 1.3) * 7 + i * 0.11,
    worldY: 0.3,
    worldZ: Math.sin(i * 0.7) * 5 - i * 0.05,
    rotation: (i * 2.39996) % (Math.PI * 2),
    scale: 0.8 + (i % 7) * 0.08,
    biome,
  };
}

const rocks = Array.from({ length: 300 }, (_, i) => placement(i));
const variations = rocks.map((r) => rockVariation(r));

describe("rockSizeClass", () => {
  it("gives large outcrops to ROCK cells, medium to GRASS and small to SAND", () => {
    expect(rockSizeClass("ROCK")).toBe("large");
    expect(rockSizeClass("GRASS")).toBe("medium");
    expect(rockSizeClass("SAND")).toBe("small");
  });

  it("falls back to medium when the biome is unknown", () => {
    expect(rockSizeClass(undefined)).toBe("medium");
  });

  it("orders the class scales large > medium > small", () => {
    expect(ROCK_SIZE_CLASS_SCALE.large).toBeGreaterThan(ROCK_SIZE_CLASS_SCALE.medium);
    expect(ROCK_SIZE_CLASS_SCALE.medium).toBeGreaterThan(ROCK_SIZE_CLASS_SCALE.small);
  });

  it("keeps even the small class at unit scale, so a sand rock is no pebble at ship zoom", () => {
    // Before the retune (large 1.5 / medium 1 / small 0.65) sand rocks vanished into the beach.
    expect(ROCK_SIZE_CLASS_SCALE.small).toBeGreaterThanOrEqual(1);
    expect(ROCK_SIZE_CLASS_SCALE.medium).toBeGreaterThanOrEqual(1.4);
    expect(ROCK_SIZE_CLASS_SCALE.large).toBeGreaterThanOrEqual(2);
    // A large outcrop stays within a hex: unit radius × class × the generator's biggest scale (1.6).
    expect(ROCK_SIZE_CLASS_SCALE.large * 1.6).toBeLessThanOrEqual(4);
  });
});

describe("ROCK_BASE_COLOR", () => {
  it("is clearly darker than the sand on sand cells, so stones don't vanish into the beach", () => {
    expect(luminance(ROCK_BASE_COLOR.SAND)).toBeLessThan(0.5 * luminance(PALETTE_HEX.drySand));
    expect(luminance(ROCK_BASE_COLOR.SAND)).toBeLessThan(luminance(PALETTE_HEX.wetSand));
  });

  it("is a near-neutral grey on grass, distinct from the green by hue rather than brightness", () => {
    expect(chroma(ROCK_BASE_COLOR.GRASS)).toBeLessThanOrEqual(0x12);
    expect(chroma(PALETTE_HEX.jungle)).toBeGreaterThan(0x30);
  });

  it("is a slate on ROCK cells, clearly below the highland rock the summit is painted with", () => {
    // The old rocks used highlandRock itself, so outcrops were invisible on the summits they sat on.
    // Not too far below either: at half its luminance they read as holes beside the summit's shaded faces.
    expect(luminance(ROCK_BASE_COLOR.ROCK)).toBeLessThan(0.7 * luminance(PALETTE_HEX.highlandRock));
    expect(luminance(ROCK_BASE_COLOR.ROCK)).toBeGreaterThan(0.5 * luminance(PALETTE_HEX.highlandRock));
    expect(chroma(ROCK_BASE_COLOR.ROCK)).toBeLessThanOrEqual(0x12);
  });

  it("is less warm than the sand it sits on (blue-to-red ratio above the beach's)", () => {
    const warmth = (hex: number) => ((hex >> 16) & 0xff) / (hex & 0xff);
    expect(warmth(ROCK_BASE_COLOR.SAND)).toBeLessThan(warmth(PALETTE_HEX.drySand));
  });
});

describe("rockVariation", () => {
  it("is deterministic for the same input", () => {
    expect(rockVariation(rocks[5])).toEqual(rockVariation({ ...rocks[5] }));
  });

  it("spreads the variant index across inputs", () => {
    const counts = new Array(ROCK_VARIANT_COUNT).fill(0);
    for (const v of variations) {
      expect(Number.isInteger(v.variant)).toBe(true);
      expect(v.variant).toBeGreaterThanOrEqual(0);
      expect(v.variant).toBeLessThan(ROCK_VARIANT_COUNT);
      counts[v.variant]++;
    }
    for (const count of counts) expect(count).toBeGreaterThan(variations.length / (ROCK_VARIANT_COUNT * 2));
  });

  it("keeps the tint within ±15% of the base colour: wide enough that neighbours differ, which ±8% was not", () => {
    expect(ROCK_TINT_SPREAD).toBe(0.15);
    for (const v of variations) {
      expect(v.tint).toBeGreaterThanOrEqual(1 - ROCK_TINT_SPREAD);
      expect(v.tint).toBeLessThanOrEqual(1 + ROCK_TINT_SPREAD);
    }
    const tints = variations.map((v) => v.tint);
    expect(Math.max(...tints) - Math.min(...tints)).toBeGreaterThan(ROCK_TINT_SPREAD);
  });

  it("scales rocks non-uniformly, by the decoration scale and the size class", () => {
    rocks.forEach((rock, i) => {
      const v = variations[i];
      const base = rock.scale * ROCK_SIZE_CLASS_SCALE[v.sizeClass];
      for (const axis of v.scale) {
        expect(axis).toBeGreaterThanOrEqual(base * ROCK_STRETCH_RANGE[0] - 1e-9);
        expect(axis).toBeLessThanOrEqual(base * ROCK_STRETCH_RANGE[1] + 1e-9);
      }
    });
    const anisotropic = variations.filter((v) => Math.abs(v.scale[0] - v.scale[2]) > 0.01 * v.scale[0]);
    expect(anisotropic.length).toBeGreaterThan(variations.length / 2);
  });

  it("gives ROCK cells the large class and bigger rocks than the same decoration on SAND", () => {
    const onRock = rockVariation(placement(4, "ROCK"));
    const onSand = rockVariation(placement(4, "SAND"));
    expect(onRock.sizeClass).toBe("large");
    expect(onSand.sizeClass).toBe("small");
    expect(onRock.scale[0] * onRock.scale[1] * onRock.scale[2]).toBeGreaterThan(
      onSand.scale[0] * onSand.scale[1] * onSand.scale[2]
    );
  });

  it("lets the caller force a size class (small stones)", () => {
    const stone = rockVariation(placement(4, "GRASS"), "small");
    expect(stone.sizeClass).toBe("small");
  });

  it("colours each rock by its cell's biome, unknown biomes as grass", () => {
    for (const biome of BIOMES) expect(rockVariation(placement(4, biome)).baseColor).toBe(ROCK_BASE_COLOR[biome]);
    expect(rockVariation(placement(4, undefined)).baseColor).toBe(ROCK_BASE_COLOR.GRASS);
  });

  it("keeps the biome colour on a stone whose size class is forced", () => {
    expect(rockVariation(placement(4, "SAND"), "small").baseColor).toBe(ROCK_BASE_COLOR.SAND);
  });

  it("tilts each rock only a little, and faces it along its decoration rotation", () => {
    rocks.forEach((rock, i) => {
      const v = variations[i];
      expect(v.yaw).toBe(rock.rotation);
      for (const t of v.tilt) {
        expect(t).toBeGreaterThanOrEqual(ROCK_TILT_RANGE[0]);
        expect(t).toBeLessThanOrEqual(ROCK_TILT_RANGE[1]);
      }
    });
    expect(ROCK_TILT_RANGE[1]).toBeLessThanOrEqual(0.3);
  });

  it("buries each rock a little, never lifts it", () => {
    for (const v of variations) {
      expect(v.bury).toBeGreaterThanOrEqual(ROCK_BURY_RANGE[0]);
      expect(v.bury).toBeLessThanOrEqual(ROCK_BURY_RANGE[1]);
    }
    expect(ROCK_BURY_RANGE[0]).toBeGreaterThanOrEqual(0);
  });

  it("varies between neighbouring rocks", () => {
    const a = rockVariation(rocks[10]);
    const b = rockVariation({ ...rocks[10], worldX: rocks[10].worldX + 0.05 });
    expect(a.tint).not.toBeCloseTo(b.tint, 3);
    expect(a.scale[0]).not.toBeCloseTo(b.scale[0], 3);
  });
});
