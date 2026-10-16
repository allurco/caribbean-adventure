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
import type { ShellLayout } from "./shellLayout";

/** The smallest tap target on a phone, in CSS pixels. */
export const MIN_TAP_TARGET = 48;

/**
 * The corner link's layer: above the captain draft's overlay (z-55) so it
 * stays the way back to the harbour while a captain is picked, and above the
 * game-over screen (z-50) as the match's Leave to harbour is; under the
 * loading screen (z-60), which covers everything until the scene is ready.
 * The port and combat panels have no layer of their own; the link keeps clear
 * of them by where it sits. `accountLinkLayer.node.test.ts` pins this to the
 * board's sources.
 */
export const ACCOUNT_LINK_Z = 58;

/** Under the HUD's turn bar, with a gap. */
const TOP = HUD_TOP_BAR_HEIGHT + 12;
const EDGE = 16;
const GAP = 8;

/** The compact link's width, fixed so it can be placed beside the HUD: "The harbour" with its padding is about 102 px. */
export const ACCOUNT_LINK_COMPACT_WIDTH = 112;

/** On Save & leave's row, right of it. */
const ROW_LEFT = HUD_SAVE_LEAVE_LEFT + HUD_SAVE_LEAVE_WIDTH + GAP;
/** Under Save & leave, right of the glory panel. */
const UNDER_TOP = HUD_STACK_TOP + HUD_SAVE_LEAVE_HEIGHT + GAP;
const UNDER_LEFT = HUD_GLORY_BOARD_LEFT + HUD_GLORY_BOARD_WIDTH + GAP;
/** The port panel's column on the right, which on a phone runs from the top of the screen to the bottom. */
const PORT_COLUMN = HUD_PORT_PANEL_INSET + HUD_PORT_PANEL_WIDTH;

export interface AccountLinkPlacement {
  top: number;
  /** One of `right` and `left` is set. */
  right?: number;
  left?: number;
  /** Set on compact screens, where the link must be a full tap target of a known width. */
  minHeight?: number;
  width?: number;
}

/** What is under the link: whether the board's HUD stack shows (`hudStackShows`), and the window's width. */
export interface AccountLinkScene {
  hudStack: boolean;
  viewportWidth: number;
}

/**
 * Where the corner link over the local game sits (#125). On desktop, the top
 * right corner under the turn bar. On a compact screen (a phone held
 * sideways) it is a full 48 px tap target. While the HUD stack shows it sits
 * on Save & leave's row, right of it: the highest spot left of the port
 * panel, so the captain and ship card, which grows upward as the ship takes
 * on cargo, upgrades, damage and bounties, would cover the glory panel before
 * it reached the link. Where that row meets the port panel's column (a phone
 * under about 750 px wide) it goes under Save & leave, right of the glory
 * panel instead. With the stack down (a captain picked, a fight, game over)
 * it takes the empty top-right corner. Pure, no React.
 */
export function accountLinkPlacement(layout: ShellLayout, scene: AccountLinkScene): AccountLinkPlacement {
  if (layout === "desktop") return { top: TOP, right: EDGE };
  const size = { minHeight: MIN_TAP_TARGET, width: ACCOUNT_LINK_COMPACT_WIDTH };
  if (!scene.hudStack) return { top: EDGE, right: EDGE, ...size };
  const rowFits = ROW_LEFT + ACCOUNT_LINK_COMPACT_WIDTH + GAP <= scene.viewportWidth - PORT_COLUMN;
  return rowFits ? { top: HUD_STACK_TOP, left: ROW_LEFT, ...size } : { top: UNDER_TOP, left: UNDER_LEFT, ...size };
}
