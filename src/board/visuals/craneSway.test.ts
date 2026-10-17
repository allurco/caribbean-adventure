import { describe, it, expect } from "vitest";
import type { FacetGeometryData, Vec3 } from "./facetBuilder";
import { advanceSwayAngle } from "./palmSway";
import { SCENE_WIND } from "./sceneWind";
import { CRANE_SWAY_AMPLITUDE, craneLoadGeometry, craneLoadPhase, craneSwing, injectCraneSway, swayedPoint } from "./craneSway";
import type { CranePlacement } from "./harbourFurniture";

const PIVOT: Vec3 = [1, 0.3, -2];

describe("the cranes' loads swaying (#181)", () => {
  it("swings each load a few degrees about its jib's tip, the same at the same clock angle", () => {
    let most = 0;
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const swing = craneSwing(a, 0.7);
      most = Math.max(most, Math.abs(swing));
      expect(craneSwing(a, 0.7)).toBe(swing);
    }
    expect(most).toBeCloseTo(CRANE_SWAY_AMPLITUDE, 2);
    expect(CRANE_SWAY_AMPLITUDE).toBeLessThan(0.15);
  });

  it("keeps the tip still and swings a point the further the more it hangs below it, along the scene's wind", () => {
    const angle = Math.PI / 4;
    expect(swayedPoint(PIVOT, PIVOT, angle, 0)).toEqual(PIVOT);
    const near = swayedPoint([PIVOT[0], PIVOT[1] - 0.02, PIVOT[2]], PIVOT, angle, 0);
    const far = swayedPoint([PIVOT[0], PIVOT[1] - 0.1, PIVOT[2]], PIVOT, angle, 0);
    const moved = (p: Vec3) => Math.hypot(p[0] - PIVOT[0], p[2] - PIVOT[2]);
    expect(moved(far)).toBeGreaterThan(moved(near) * 4);
    // Along the wind's line, keeping its length on the rope.
    const [wx, wz] = SCENE_WIND.toward;
    const dx = far[0] - PIVOT[0];
    const dz = far[2] - PIVOT[2];
    expect(Math.abs(dx * wz - dz * wx)).toBeLessThan(1e-9);
    expect(Math.hypot(dx, far[1] - PIVOT[1], dz)).toBeCloseTo(0.1, 9);
  });

  it("holds still under reduced motion: the clock stops, so two frames draw the load in one place", () => {
    const a = advanceSwayAngle(1.2, 0.016, true);
    const b = advanceSwayAngle(a, 0.016, true);
    expect(b).toBe(a);
    expect(a).toBeCloseTo(1.2, 12);
    const p: Vec3 = [PIVOT[0], PIVOT[1] - 0.1, PIVOT[2]];
    expect(swayedPoint(p, PIVOT, a, 0.4)).toEqual(swayedPoint(p, PIVOT, b, 0.4));
    // And it does move when the clock runs.
    expect(swayedPoint(p, PIVOT, advanceSwayAngle(1.2, 0.1, false), 0.4)).not.toEqual(swayedPoint(p, PIVOT, 1.2, 0.4));
  });

  it("bakes every crane's load into one mesh, each vertex carrying its crane's tip and phase", () => {
    const load: FacetGeometryData = {
      positions: new Float32Array([0, CRANE_TIP_Y, 0.19, 0.01, CRANE_TIP_Y - 0.1, 0.19, -0.01, CRANE_TIP_Y - 0.1, 0.19]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      colors: new Float32Array(9).fill(0.5),
      vertexCount: 3,
    };
    const cranes: CranePlacement[] = [
      { x: 1, y: 0.05, z: 2, yaw: 0, scale: 0.9, tip: [1, 0.05 + CRANE_TIP_Y * 0.9, 2 + 0.19 * 0.9] },
      { x: -3, y: 0.04, z: 0, yaw: Math.PI / 2, scale: 0.9, tip: [-3 + 0.19 * 0.9, 0.04 + CRANE_TIP_Y * 0.9, 0] },
    ];
    const g = craneLoadGeometry(cranes, load);
    expect(g.vertexCount).toBe(6);
    expect(g.pivots.length).toBe(18);
    expect(g.phases.length).toBe(6);
    for (let c = 0; c < 2; c++) {
      // The rope's top lands on the crane's tip; its pivot is that tip.
      for (let k = 0; k < 3; k++) {
        expect(g.positions[c * 9 + k]).toBeCloseTo(cranes[c].tip[k], 6);
        expect(g.pivots[c * 9 + k]).toBeCloseTo(cranes[c].tip[k], 6);
        expect(g.pivots[c * 9 + 3 + k]).toBeCloseTo(cranes[c].tip[k], 6);
      }
      expect(g.phases[c * 3]).toBeCloseTo(craneLoadPhase(cranes[c]), 5);
    }
    // Two cranes swing out of step.
    expect(craneLoadPhase(cranes[0])).not.toBe(craneLoadPhase(cranes[1]));
  });

  it("patches the vertex shader after begin_vertex, binding the shared clock", () => {
    const angle = { value: 0.3 };
    const shader = { vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n}", uniforms: {} as Record<string, { value: unknown }> };
    const source = injectCraneSway(shader, angle);
    expect(shader.uniforms.uCraneSwayAngle).toBe(angle);
    expect(source).toMatch(/attribute vec3 swayPivot/);
    expect(source).toMatch(/attribute float swayPhase/);
    expect(source.indexOf("#include <begin_vertex>")).toBeLessThan(source.indexOf("swayPivot - transformed"));
  });
});

const CRANE_TIP_Y = 0.258;
