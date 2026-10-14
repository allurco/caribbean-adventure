/**
 * Fixed sizes of the HUD overlay, shared with the 3D scene so world-anchored
 * labels keep clear of it. Plain numbers, no React, so `visuals/` can import
 * them.
 */

/**
 * Height of the HUD's top bar (`HudTurnBar`), in CSS pixels. Its tallest
 * child, the glory counter, is 38 px; with the bar's 10 px padding above and
 * below that is the 58 px the bar drew at when its height came from its content.
 */
export const HUD_TOP_BAR_HEIGHT = 58;

/** Width of the port panel (`PortPanel`, Tailwind `w-72`), in CSS pixels; the ship view keeps the ship clear of it. */
export const HUD_PORT_PANEL_WIDTH = 288;
/** Gap between the port panel and the screen's right edge (`right-4`), in CSS pixels. */
export const HUD_PORT_PANEL_INSET = 16;
