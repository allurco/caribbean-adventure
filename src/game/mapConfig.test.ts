import { describe, it, expect } from "vitest";
import {
  MAP_PRESETS,
  DEFAULT_MAP_SIZE,
  getMapPreset,
  computeCameraConfig,
} from "./mapConfig";
import type { MapSizeId } from "./mapConfig";

describe("MAP_PRESETS", () => {
  it("has exactly three presets", () => {
    expect(MAP_PRESETS).toHaveLength(3);
  });

  it("presets are ordered small, medium, large", () => {
    expect(MAP_PRESETS[0].id).toBe("small");
    expect(MAP_PRESETS[1].id).toBe("medium");
    expect(MAP_PRESETS[2].id).toBe("large");
  });

  it("radii increase with each preset", () => {
    for (let i = 1; i < MAP_PRESETS.length; i++) {
      expect(MAP_PRESETS[i].radius).toBeGreaterThan(MAP_PRESETS[i - 1].radius);
    }
  });

  it("every preset has a positive integer radius", () => {
    for (const preset of MAP_PRESETS) {
      expect(preset.radius).toBeGreaterThan(0);
      expect(Number.isInteger(preset.radius)).toBe(true);
    }
  });

  it("every preset has a non-empty label", () => {
    for (const preset of MAP_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });
});

describe("DEFAULT_MAP_SIZE", () => {
  it("is a valid map size id", () => {
    const ids = MAP_PRESETS.map((p) => p.id);
    expect(ids).toContain(DEFAULT_MAP_SIZE);
  });

  it("defaults to small", () => {
    expect(DEFAULT_MAP_SIZE).toBe("small");
  });
});

describe("getMapPreset", () => {
  it("returns the correct preset for each size", () => {
    const sizes: MapSizeId[] = ["small", "medium", "large"];
    for (const size of sizes) {
      const preset = getMapPreset(size);
      expect(preset.id).toBe(size);
    }
  });

  it("returns preset with expected radii", () => {
    expect(getMapPreset("small").radius).toBe(12);
    expect(getMapPreset("medium").radius).toBe(18);
    expect(getMapPreset("large").radius).toBe(25);
  });
});

describe("computeCameraConfig", () => {
  it("returns positive height and offset", () => {
    const config = computeCameraConfig(5);
    expect(config.height).toBeGreaterThan(0);
    expect(config.offset).toBeGreaterThan(0);
  });

  it("minDistance is less than maxDistance", () => {
    for (const preset of MAP_PRESETS) {
      const config = computeCameraConfig(preset.radius);
      expect(config.minDistance).toBeLessThan(config.maxDistance);
    }
  });

  it("minDistance is positive", () => {
    for (const preset of MAP_PRESETS) {
      const config = computeCameraConfig(preset.radius);
      expect(config.minDistance).toBeGreaterThan(0);
    }
  });

  it("scales with radius — larger radius produces larger values", () => {
    const small = computeCameraConfig(5);
    const large = computeCameraConfig(12);
    expect(large.height).toBeGreaterThan(small.height);
    expect(large.maxDistance).toBeGreaterThan(small.maxDistance);
  });
});
