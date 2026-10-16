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
  hudHintTop,
  hudToastTop,
} from "../board/hudLayout";
import { ACCOUNT_LINK_COMPACT_WIDTH, accountLinkPlacement, MIN_TAP_TARGET } from "./accountLinkPlacement";

// The corner link over the local game back to the harbour (#125, PR #306).
// Phones held sideways run from 667 to 932 px wide; the port panel's column
// takes the right of the screen at every height a phone has.
const GAP = 8;
const PORT_COLUMN = HUD_PORT_PANEL_INSET + HUD_PORT_PANEL_WIDTH;
const SAVE_LEAVE_RIGHT = HUD_SAVE_LEAVE_LEFT + HUD_SAVE_LEAVE_WIDTH;
const GLORY_BOARD_RIGHT = HUD_GLORY_BOARD_LEFT + HUD_GLORY_BOARD_WIDTH;
const compact = (viewportWidth: number, hudStack = true, portPanel = true) =>
  accountLinkPlacement("compact", { hudStack, portPanel, viewportWidth });

/** The link's box, as `[left, top, right, bottom]`. */
function box(viewportWidth: number, portPanel = true) {
  const { top, left, right, width } = compact(viewportWidth, true, portPanel);
  expect(right).toBeUndefined();
  return [left!, top, left! + width!, top + MIN_TAP_TARGET];
}

/** Every compact width, from a narrowed desktop window to the widest phone held sideways (and wider, for short windows). */
const COMPACT_WIDTHS = Array.from({ length: 1600 - 320 + 1 }, (_, i) => 320 + i);

describe("accountLinkPlacement", () => {
  it("keeps the desktop link in the top right corner, under the turn bar, with or without the HUD stack", () => {
    for (const hudStack of [true, false]) {
      const desktop = accountLinkPlacement("desktop", { hudStack, portPanel: true, viewportWidth: 1440 });
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

  it("on a narrower phone docked at a port, where that row meets the port panel, goes under Save & leave and right of the glory panel", () => {
    for (const width of [667, 736, 751]) {
      const [left, top, right] = box(width);
      expect(top).toBeGreaterThanOrEqual(HUD_STACK_TOP + HUD_SAVE_LEAVE_HEIGHT + GAP);
      expect(left).toBeGreaterThanOrEqual(GLORY_BOARD_RIGHT + GAP);
      expect(right).toBeLessThanOrEqual(width - PORT_COLUMN - GAP);
    }
  });

  it("goes back to Save & leave's row from 752 px wide, the first width where the row clears the port panel", () => {
    expect(box(751)[1]).not.toBe(HUD_STACK_TOP);
    expect(box(752)[1]).toBe(HUD_STACK_TOP);
    expect(box(752)[2]).toBeLessThanOrEqual(752 - PORT_COLUMN - GAP);
  });

  it("stays on Save & leave's row at any width while the port panel is closed, so a growing ship card never reaches it", () => {
    for (const width of [667, 736, 751, 752, 844]) {
      const [left, top] = box(width, false);
      expect(top).toBe(HUD_STACK_TOP);
      expect(left).toBeGreaterThanOrEqual(SAVE_LEAVE_RIGHT + GAP);
    }
  });

  it("where neither spot clears the port panel (a narrowed desktop window), takes the top-right corner under the turn bar", () => {
    expect(box(660)[1]).toBe(HUD_STACK_TOP + HUD_SAVE_LEAVE_HEIGHT + GAP);
    expect(box(660)[2]).toBeLessThanOrEqual(660 - PORT_COLUMN - GAP);
    expect(compact(659)).toEqual({ top: HUD_TOP_BAR_HEIGHT + 12, right: 16, minHeight: MIN_TAP_TARGET, width: ACCOUNT_LINK_COMPACT_WIDTH });
  });

  it("never meets the port panel's column while it is open, at any compact width it sits left of it", () => {
    for (const width of COMPACT_WIDTHS) {
      const { left, width: linkWidth } = compact(width);
      if (left !== undefined) expect(left + linkWidth!).toBeLessThanOrEqual(width - PORT_COLUMN - GAP);
    }
  });

  it("keeps above the centred hint band (route, attack and spyglass prompts, mission toast) at every compact width", () => {
    for (const width of COMPACT_WIDTHS)
      for (const hudStack of [true, false])
        for (const portPanel of [true, false]) {
          const { top } = compact(width, hudStack, portPanel);
          expect(top + MIN_TAP_TARGET + GAP).toBeLessThanOrEqual(hudHintTop("compact"));
          expect(hudToastTop("compact")).toBeGreaterThanOrEqual(hudHintTop("compact"));
        }
  });

  it("leaves the desktop hint band where it was: the prompts at 80 px, the mission toast at 96 px", () => {
    expect(hudHintTop("desktop")).toBe(80);
    expect(hudToastTop("desktop")).toBe(96);
  });

  it("takes the empty top-right corner when the HUD stack is down (a captain picked, a fight, game over)", () => {
    expect(compact(844, false)).toEqual({ top: 16, right: 16, minHeight: MIN_TAP_TARGET, width: ACCOUNT_LINK_COMPACT_WIDTH });
  });
});
