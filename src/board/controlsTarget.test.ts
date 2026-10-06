import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { controlsTarget } from "./controlsTarget";

describe("controlsTarget", () => {
  it("returns the controls' target vector itself, not a copy", () => {
    const target = new Vector3(3, 0, -5);
    expect(controlsTarget({ target })).toBe(target);
  });

  it("returns null before the controls exist", () => {
    expect(controlsTarget(null)).toBeNull();
    expect(controlsTarget(undefined)).toBeNull();
  });

  it("returns null for controls without a Vector3 target", () => {
    expect(controlsTarget({})).toBeNull();
    expect(controlsTarget({ target: [1, 2, 3] })).toBeNull();
    expect(controlsTarget({ target: { x: 1, y: 2, z: 3 } })).toBeNull();
  });
});
