import {
  HUD_EDGE,
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
import { NO_INSETS, type SafeAreaInsets } from "../board/safeArea";
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

/**
 * What is under the link: whether the link may sit beside the board's HUD
 * stack (`hudStackShows`), whether the port panel is open, and the window's
 * width.
 */
export interface AccountLinkScene {
  hudStack: boolean;
  portPanel: boolean;
  viewportWidth: number;
  /** The screen's safe-area insets (#123): the HUD pads by them, so the link does too. None when left out. */
  insets?: SafeAreaInsets;
}

/**
 * Where the corner link over the local game sits (#125). On desktop, the top
 * right corner under the turn bar. On a compact screen (a phone held
 * sideways) it is a full 48 px tap target. While the HUD stack shows it sits
 * on Save & leave's row, right of it: the highest spot on that side, so the
 * captain and ship card, which grows upward as the ship takes on cargo,
 * upgrades, damage and bounties, would cover the glory panel before it
 * reached the link. Only the port panel, open while docked, can block that
 * row: where the row meets the panel's column (a phone under 752 px wide) the
 * link goes under Save & leave, right of the glory panel; where that meets
 * it too (under 660 px, a narrowed desktop window), the top-right corner
 * under the turn bar. With the stack down (a captain picked, a fight, game
 * over) it takes the empty top-right corner. Under a notch every spot moves
 * in by the safe-area insets, as the HUD does, and the room beside the port
 * panel shrinks by both side insets. Pure, no React.
 */
export function accountLinkPlacement(layout: ShellLayout, scene: AccountLinkScene): AccountLinkPlacement {
  const insets = scene.insets ?? NO_INSETS;
  const corner = (top: number) => ({ top: top + insets.top, right: HUD_EDGE + insets.right });
  if (layout === "desktop") return corner(TOP);
  const size = { minHeight: MIN_TAP_TARGET, width: ACCOUNT_LINK_COMPACT_WIDTH };
  if (!scene.hudStack) return { ...corner(HUD_EDGE), ...size };
  const clearOfPanel = (left: number) =>
    !scene.portPanel ||
    insets.left + left + ACCOUNT_LINK_COMPACT_WIDTH + GAP <= scene.viewportWidth - insets.right - PORT_COLUMN;
  const beside = (top: number, left: number) => ({ top: top + insets.top, left: left + insets.left, ...size });
  if (clearOfPanel(ROW_LEFT)) return beside(HUD_STACK_TOP, ROW_LEFT);
  if (clearOfPanel(UNDER_LEFT)) return beside(UNDER_TOP, UNDER_LEFT);
  return { ...corner(TOP), ...size };
}
