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

/** Under the HUD's 58 px turn bar, with a gap. */
const TOP = 70;
const EDGE = 16;
const GAP = 8;
/** Save & leave (`HudSaveLeave`, `top-12`): about 31 px tall, so its foot is at 79. */
const SAVE_LEAVE_BOTTOM = 48 + 31;
/** The glory panel (`HudGloryBoard`, `left-5 w-52`): its right edge. */
const GLORY_BOARD_RIGHT = 20 + 208;

export interface AccountLinkPlacement {
  top: number;
  /** One of `right` and `left` is set. */
  right?: number;
  left?: number;
  /** Set on compact screens, where the link must be a full tap target. */
  minHeight?: number;
}

/** What the board shows under the link: whether the HUD's turn bar is up (not in the captain draft or a fight). */
export interface AccountLinkScene {
  turnBar: boolean;
}

/**
 * Where the corner link over the local game sits (#125). On desktop, the top
 * right corner under the turn bar. On a compact screen (a phone held
 * sideways) it is a full 48 px tap target and goes where nothing else is
 * (measured at 844×390 and 667×375): on the board it joins the HUD's top-left
 * stack, under Save & leave and right of the glory panel, above the captain
 * card and left of the port panel; with the turn bar down (the captain draft,
 * a fight) it takes the empty top-right corner, beside the draft's title and
 * the combat panel. Pure, no React.
 */
export function accountLinkPlacement(layout: ShellLayout, scene: AccountLinkScene): AccountLinkPlacement {
  if (layout === "desktop") return { top: TOP, right: EDGE };
  if (!scene.turnBar) return { top: EDGE, right: EDGE, minHeight: MIN_TAP_TARGET };
  return { top: SAVE_LEAVE_BOTTOM + GAP, left: GLORY_BOARD_RIGHT + GAP, minHeight: MIN_TAP_TARGET };
}
