import { describe, expect, it } from "vitest";
import { safeInset, shellSafeInset } from "./safeArea";

describe("safeInset, the HUD's rule", () => {
  it("adds the edge's safe-area inset to an offset, as CSS the browser resolves", () => {
    expect(safeInset("top", 48)).toBe("calc(48px + env(safe-area-inset-top, 0px))");
    expect(safeInset("left", 20)).toBe("calc(20px + env(safe-area-inset-left, 0px))");
  });

  it("is the inset alone for a piece flush with the edge", () => {
    expect(safeInset("right", 0)).toBe("env(safe-area-inset-right, 0px)");
  });
});

describe("shellSafeInset, the shell's rule", () => {
  it("takes the margin or the inset, whichever is larger", () => {
    expect(shellSafeInset("left", 16)).toBe("max(16px, env(safe-area-inset-left, 0px))");
  });

  it("is the inset alone for a piece flush with the edge", () => {
    expect(shellSafeInset("bottom", 0)).toBe("env(safe-area-inset-bottom, 0px)");
  });
});
