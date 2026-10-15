import { HUD_PORT_PANEL_INSET, HUD_PORT_PANEL_WIDTH } from "../board/hudLayout";
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

export interface AccountLinkPlacement {
  top: number;
  right: number;
  /** Set on compact screens, where the link must be a full tap target. */
  minHeight?: number;
}

/**
 * Where the corner link over the local game sits (#125). On desktop, the top
 * right corner. On a compact screen (a phone held sideways) the port panel,
 * centred on the right, reaches up to the turn bar: there the link moves left
 * of the panel's column, so it never covers the panel's header, and is a
 * full 48 px tap target. Pure, no React.
 */
export function accountLinkPlacement(layout: ShellLayout): AccountLinkPlacement {
  if (layout === "desktop") return { top: TOP, right: EDGE };
  return { top: TOP, right: HUD_PORT_PANEL_INSET + HUD_PORT_PANEL_WIDTH + GAP, minHeight: MIN_TAP_TARGET };
}
