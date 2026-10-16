import { describe, expect, it } from "vitest";
import { safeInset } from "./safeArea";

describe("safeInset", () => {
  it("adds the edge's safe-area inset to an offset, as CSS the browser resolves", () => {
    expect(safeInset("top", 48)).toBe("calc(48px + env(safe-area-inset-top, 0px))");
    expect(safeInset("left", 20)).toBe("calc(20px + env(safe-area-inset-left, 0px))");
  });

  it("is the inset alone for a piece flush with the edge", () => {
    expect(safeInset("right", 0)).toBe("env(safe-area-inset-right, 0px)");
  });
});
