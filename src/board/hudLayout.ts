/**
 * Fixed sizes of the HUD overlay, shared with the 3D scene so world-anchored
 * labels keep clear of it. Plain numbers, no React, so `visuals/` can import
 * them.
 */

import type { ShellLayout } from "../online/shellLayout";

/**
 * Height of the HUD's top bar (`HudTurnBar`), in CSS pixels. Its tallest
 * child, the glory counter, is 38 px; with the bar's 10 px padding above and
 * below that is the 58 px the bar drew at when its height came from its content.
 */
export const HUD_TOP_BAR_HEIGHT = 58;

/** Width of the port panel (`PortPanel`), in CSS pixels; the ship view keeps the ship clear of it. */
export const HUD_PORT_PANEL_WIDTH = 288;
/** Gap between the port panel and the screen's right edge, in CSS pixels. */
export const HUD_PORT_PANEL_INSET = 16;

/**
 * Top of the HUD's top-left row under the turn bar (`HudSoundControl`, then
 * `HudSaveLeave` beside it), in CSS pixels.
 */
export const HUD_STACK_TOP = 48;
/** Save & leave's box (`HudSaveLeave`), in CSS pixels: a fixed size, so what sits beside it can be placed. */
export const HUD_SAVE_LEAVE_LEFT = 208;
export const HUD_SAVE_LEAVE_WIDTH = 112;
export const HUD_SAVE_LEAVE_HEIGHT = 32;
/** The glory panel (`HudGloryBoard`), under the top-left row: its left edge, top and width, in CSS pixels. */
export const HUD_GLORY_BOARD_LEFT = 20;
export const HUD_GLORY_BOARD_TOP = 96;
export const HUD_GLORY_BOARD_WIDTH = 208;

/**
 * Top of the centred hint band, in CSS pixels: the prompts while a route is
 * selected (`RouteHint`) or an attack or a spyglass target is picked, and the
 * mission toast (`MissionCompleteToast`) a little lower. On desktop, 80 px
 * under the turn bar. On a compact screen (a phone held sideways) the
 * harbour link of the online shell sits in the top-left stack or a top
 * corner, as low as Save & leave's foot plus a tap target (136 px, #125), so
 * the band starts below it.
 */
const HUD_HINT_TOP = 80;
const HUD_HINT_TOP_COMPACT = 144;
/** How far the mission toast sits below the hint band's top. */
const HUD_TOAST_DROP = 16;

export function hudHintTop(layout: ShellLayout): number {
  return layout === "compact" ? HUD_HINT_TOP_COMPACT : HUD_HINT_TOP;
}

export function hudToastTop(layout: ShellLayout): number {
  return hudHintTop(layout) + HUD_TOAST_DROP;
}
