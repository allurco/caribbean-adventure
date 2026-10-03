import { describe, it, expect } from "vitest";
import { palmVariation, type PalmPlacement } from "./palmVariation";

function placement(i: number): PalmPlacement {
  return {
    worldX: Math.cos(i * 1.3) * 7 + i * 0.11,
    worldY: 0.3,
    worldZ: Math.sin(i * 0.7) * 5 - i * 0.05,
    rotation: (i * 2.39996) % (Math.PI * 2),
    scale: 0.8 + (i % 7) * 0.08,
  };
}

const palms = Array.from({ length: 200 }, (_, i) => placement(i));
const variations = palms.map(palmVariation);

describe("palmVariation", () => {
  it("is deterministic for the same decoration", () => {
    expect(palmVariation(palms[3])).toEqual(palmVariation({ ...palms[3] }));
  });

  it("keeps every value in its range", () => {
    for (const v of variations) {
      expect(v.heightScale).toBeGreaterThanOrEqual(0.8);
      expect(v.heightScale).toBeLessThanOrEqual(1.25);
      expect(v.lean).toBeGreaterThanOrEqual(-0.05);
      expect(v.lean).toBeLessThanOrEqual(0.3);
      expect(v.crownTwist).toBeGreaterThanOrEqual(0);
      expect(v.crownTwist).toBeLessThan(Math.PI * 2);
      expect(v.phase).toBeGreaterThanOrEqual(0);
      expect(v.phase).toBeLessThan(Math.PI * 2);
    }
  });

  it("faces each palm along its decoration rotation", () => {
    variations.forEach((v, i) => expect(v.yaw).toBe(palms[i].rotation));
  });

  it("varies between neighbouring palms", () => {
    const a = palmVariation(palms[10]);
    const b = palmVariation({ ...palms[10], worldX: palms[10].worldX + 0.05 });
    expect(a.phase).not.toBeCloseTo(b.phase, 2);
    expect(a.heightScale).not.toBeCloseTo(b.heightScale, 3);
    expect(a.crownTwist).not.toBeCloseTo(b.crownTwist, 2);
  });

  it("spreads sway phases evenly so palms move out of step", () => {
    const bins = new Array(8).fill(0);
    for (const v of variations) bins[Math.floor((v.phase / (Math.PI * 2)) * 8)]++;
    for (const count of bins) expect(count).toBeGreaterThan(10);
  });

  it("spreads heights across the range", () => {
    const heights = variations.map((v) => v.heightScale);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.3);
  });
});
