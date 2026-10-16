import { describe, expect, it } from "vitest";
import {
  HUD_GLORY_BOARD_LEFT,
  HUD_GLORY_BOARD_WIDTH,
  HUD_PORT_PANEL_INSET,
  HUD_PORT_PANEL_WIDTH,
  HUD_SAVE_LEAVE_HEIGHT,
  HUD_SAVE_LEAVE_LEFT,
  HUD_SAVE_LEAVE_WIDTH,
  HUD_STACK_TOP,
  HUD_TOP_BAR_HEIGHT,
} from "../board/hudLayout";
import { ACCOUNT_LINK_COMPACT_WIDTH, accountLinkPlacement, MIN_TAP_TARGET } from "./accountLinkPlacement";

// The corner link over the local game back to the harbour (#125, PR #306).
// Phones held sideways run from 667 to 932 px wide; the port panel's column
// takes the right of the screen at every height a phone has.
const GAP = 8;
const PORT_COLUMN = HUD_PORT_PANEL_INSET + HUD_PORT_PANEL_WIDTH;
const SAVE_LEAVE_RIGHT = HUD_SAVE_LEAVE_LEFT + HUD_SAVE_LEAVE_WIDTH;
const GLORY_BOARD_RIGHT = HUD_GLORY_BOARD_LEFT + HUD_GLORY_BOARD_WIDTH;
const compact = (viewportWidth: number, hudStack = true) => accountLinkPlacement("compact", { hudStack, viewportWidth });

/** The link's box, as `[left, top, right, bottom]`. */
function box(viewportWidth: number) {
  const { top, left, right, width } = compact(viewportWidth);
  expect(right).toBeUndefined();
  return [left!, top, left! + width!, top + MIN_TAP_TARGET];
}

describe("accountLinkPlacement", () => {
  it("keeps the desktop link in the top right corner, under the turn bar, with or without the HUD stack", () => {
    for (const hudStack of [true, false]) {
      const desktop = accountLinkPlacement("desktop", { hudStack, viewportWidth: 1440 });
      expect(desktop).toEqual({ top: 70, right: 16 });
      expect(desktop.top).toBeGreaterThanOrEqual(HUD_TOP_BAR_HEIGHT + GAP);
    }
  });

  it("gives the compact link a 48 px tap target of a fixed width in every spot", () => {
    expect(MIN_TAP_TARGET).toBe(48);
    for (const placement of [compact(844), compact(667), compact(844, false)]) {
      expect(placement.minHeight).toBe(MIN_TAP_TARGET);
      expect(placement.width).toBe(ACCOUNT_LINK_COMPACT_WIDTH);
    }
  });

  it("sits on Save & leave's row, right of it and left of the port panel, where the phone is wide enough", () => {
    for (const width of [812, 844, 932]) {
      const [left, top, right] = box(width);
      expect(top).toBe(HUD_STACK_TOP);
      expect(left).toBeGreaterThanOrEqual(SAVE_LEAVE_RIGHT + GAP);
      expect(right).toBeLessThanOrEqual(width - PORT_COLUMN - GAP);
    }
  });

  it("on a narrower phone, where that row meets the port panel, goes under Save & leave and right of the glory panel", () => {
    const [left, top, right] = box(667);
    expect(top).toBeGreaterThanOrEqual(HUD_STACK_TOP + HUD_SAVE_LEAVE_HEIGHT + GAP);
    expect(left).toBeGreaterThanOrEqual(GLORY_BOARD_RIGHT + GAP);
    expect(right).toBeLessThanOrEqual(667 - PORT_COLUMN - GAP);
  });

  it("takes the empty top-right corner when the HUD stack is down (a captain picked, a fight, game over)", () => {
    expect(compact(844, false)).toEqual({ top: 16, right: 16, minHeight: MIN_TAP_TARGET, width: ACCOUNT_LINK_COMPACT_WIDTH });
  });
});
