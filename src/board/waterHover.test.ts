import { describe, expect, it } from "vitest";
import { NO_WATER_HOVER, waterPointerMove, waterPointerOut } from "./waterHover";

const targets = new Set([3]);

describe("water hover: the clickable target and the sea under the pointer (#239)", () => {
  it("follows the sea over every water hex, target or not", () => {
    const state = waterPointerMove(NO_WATER_HOVER, 9, 0, targets, true);
    expect(state.sea).toEqual({ id: 9, copy: 0 });
    expect(state.target.id).toBeNull();
  });

  it("follows the sea when the board is not interactive (another seat's turn), leaving the target alone", () => {
    const state = waterPointerMove(NO_WATER_HOVER, 3, 0, targets, false);
    expect(state.sea).toEqual({ id: 3, copy: 0 });
    expect(state.target.id).toBeNull();
  });

  it("hovers a move or attack target only while interactive", () => {
    const state = waterPointerMove(NO_WATER_HOVER, 3, 1, targets, true);
    expect(state.target).toEqual({ id: 3, copy: 1 });
    expect(state.sea).toEqual({ id: 3, copy: 1 });
  });

  it("drops the target, keeping the sea, when the pointer moves off the targets", () => {
    const onTarget = waterPointerMove(NO_WATER_HOVER, 3, 0, targets, true);
    const state = waterPointerMove(onTarget, 4, 0, targets, true);
    expect(state.target.id).toBeNull();
    expect(state.sea.id).toBe(4);
  });

  it("is unchanged by a move over the hex already hovered", () => {
    const state = waterPointerMove(NO_WATER_HOVER, 3, 0, targets, true);
    expect(waterPointerMove(state, 3, 0, targets, true)).toBe(state);
  });

  it("clears both when the pointer leaves the copy that set them, not another", () => {
    const state = waterPointerMove(NO_WATER_HOVER, 3, 1, targets, true);
    expect(waterPointerOut(state, 0)).toBe(state);
    expect(waterPointerOut(state, 1)).toEqual(NO_WATER_HOVER);
  });
});
