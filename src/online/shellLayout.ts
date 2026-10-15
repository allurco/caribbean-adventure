/**
 * Which of the shell's two layouts (#125) a window gets. "desktop": the nav
 * board at the top left, the party board at the bottom left, the sheet
 * centred under a hanging nameboard. "compact": a phone held sideways (667×375
 * to 932×430) and any window shorter than a phone's top or too narrow for the floating boards: a
 * slim nav board down the left, a one-line nameboard, the sheet scrolling in
 * itself and the party behind a seal cluster at the top right. Portrait
 * phones get the rotate gate of #123 over the shell. Pure, no React.
 */
export type ShellLayout = "desktop" | "compact";

/** Narrower than this, the sheet has no room beside the floating boards. */
export const DESKTOP_MIN_WIDTH = 768;
/**
 * Shorter than this, the window is a phone held sideways (they top out about
 * 430 px tall). A 1280×720 laptop's inner height (about 580 to 620 px) stays
 * well above it. The `short-landscape` CSS variant in `src/index.css` switches
 * at the same height (its test pins the two together).
 */
export const COMPACT_BELOW_HEIGHT = 500;
/** Shorter than this, the nav board (about 400 px) and the party board no longer fit one above the other on desktop. */
export const PARTY_DOCK_MIN_HEIGHT = 600;

export function shellLayoutFor({ width, height }: { width: number; height: number }): ShellLayout {
  return width < DESKTOP_MIN_WIDTH || height < COMPACT_BELOW_HEIGHT ? "compact" : "desktop";
}

/**
 * Whether the desktop party board fits under the nav board. When it does not
 * (a short laptop window), it is left off: Party stays on the nav board.
 */
export function partyDockFits({ height }: { height: number }): boolean {
  return height >= PARTY_DOCK_MIN_HEIGHT;
}
