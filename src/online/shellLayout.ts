/**
 * Which of the shell's two layouts (#125) a window gets. "desktop": the nav
 * board at the top left, the party board at the bottom left, the sheet
 * centred under a hanging nameboard. "compact": a phone held sideways (667×375
 * to 932×430) and any window too short or narrow for the floating boards: a
 * slim nav board down the left, a one-line nameboard, the sheet scrolling in
 * itself and the party behind a seal cluster at the top right. Portrait
 * phones get the rotate gate of #123 over the shell. Pure, no React.
 */
export type ShellLayout = "desktop" | "compact";

/** Narrower than this, the sheet has no room beside the floating boards. */
export const DESKTOP_MIN_WIDTH = 768;
/** Shorter than this, the nav board (about 400 px) and the party board no longer fit one above the other. */
export const DESKTOP_MIN_HEIGHT = 600;

export function shellLayoutFor({ width, height }: { width: number; height: number }): ShellLayout {
  return width < DESKTOP_MIN_WIDTH || height < DESKTOP_MIN_HEIGHT ? "compact" : "desktop";
}
