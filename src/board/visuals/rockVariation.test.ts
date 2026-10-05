import { describe, it, expect } from "vitest";
import type { Biome } from "../../game/types";
import {
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

const BIOMES: readonly Biome[] = ["SAND", "GRASS", "ROCK"];

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

  it("keeps the tint within ±8% of the base colour", () => {
    expect(ROCK_TINT_SPREAD).toBe(0.08);
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
