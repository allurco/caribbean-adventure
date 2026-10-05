import { describe, expect, it } from "vitest";
import { hoverEnter, hoverLeave, NO_HOVER } from "./sharedHover";

describe("shared hover across world copies", () => {
  it("records the hovered item and the copy it was hovered in", () => {
    expect(hoverEnter(NO_HOVER, 7, 1)).toEqual({ id: 7, copy: 1 });
  });

  it("clears when the pointer leaves the copy that set it", () => {
    expect(hoverLeave({ id: 7, copy: 1 }, 1)).toBe(NO_HOVER);
  });

  it("keeps the hover when another copy reports a late leave, whatever order the events come in", () => {
    // Pointer moved from copy 0 into copy 1: copy 1's enter can arrive before copy 0's leave.
    const state = hoverEnter(hoverEnter(NO_HOVER, 7, 0), 7, 1);
    expect(hoverLeave(state, 0)).toEqual({ id: 7, copy: 1 });
  });
});
