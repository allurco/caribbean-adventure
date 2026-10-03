import { describe, it, expect } from "vitest";
import {
  advanceSwayAngle,
  injectPalmSway,
  PALM_SWAY_SPEED,
  PALM_SWAY_REDUCED_SPEED,
  MAX_SWAY_STEP,
} from "./palmSway";

const TAU = Math.PI * 2;

describe("advanceSwayAngle", () => {
  it("advances by delta times speed", () => {
    expect(advanceSwayAngle(0.5, 0.02, false)).toBeCloseTo(0.5 + 0.02 * PALM_SWAY_SPEED, 10);
  });

  it("wraps into [0, 2π) so the shader never sees a large time", () => {
    let angle = 0;
    for (let i = 0; i < 100_000; i++) angle = advanceSwayAngle(angle, 0.05, false);
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(TAU);
    expect(advanceSwayAngle(TAU - 0.001, 0.05, false)).toBeLessThan(1);
  });

  it("slows to the reduced speed with reduced motion", () => {
    expect(PALM_SWAY_REDUCED_SPEED).toBeLessThan(PALM_SWAY_SPEED * 0.1);
    expect(advanceSwayAngle(1, 0.05, true)).toBeCloseTo(1 + 0.05 * PALM_SWAY_REDUCED_SPEED, 10);
  });

  it("clamps long frame gaps (e.g. after a background tab) to avoid jumps", () => {
    expect(advanceSwayAngle(0, 5, false)).toBeCloseTo(MAX_SWAY_STEP * PALM_SWAY_SPEED, 10);
  });
});

describe("injectPalmSway", () => {
  const vertexShader = [
    "#include <common>",
    "void main() {",
    "#include <begin_vertex>",
    "#include <project_vertex>",
    "}",
  ].join("\n");

  it("adds the sway uniform, attributes and displacement", () => {
    const uniforms: Record<string, { value: unknown }> = {};
    const angle = { value: 0.3 };
    const out = injectPalmSway({ vertexShader, uniforms }, angle);
    expect(uniforms.uPalmSwayAngle).toBe(angle);
    expect(out).toContain("uniform float uPalmSwayAngle;");
    expect(out).toContain("attribute vec2 palm;");
    expect(out).toContain("attribute vec2 palmInstance;");
    // Displacement follows begin_vertex, so projection and shadows both see it.
    const begin = out.indexOf("#include <begin_vertex>");
    const sway = out.indexOf("transformed +=");
    const project = out.indexOf("#include <project_vertex>");
    expect(begin).toBeGreaterThan(-1);
    expect(sway).toBeGreaterThan(begin);
    expect(project).toBeGreaterThan(sway);
  });
});
