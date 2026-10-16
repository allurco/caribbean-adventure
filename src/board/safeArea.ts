/**
 * The safe areas (#123): with `viewport-fit=cover` the page runs under a
 * phone's notch and rounded corners, so what sits at its edges pads by
 * `env(safe-area-inset-*)`. A desktop browser reports zero insets. Pure, no
 * React.
 *
 * One rule per family:
 * - The game's HUD is additive (`safeInset`): its offset, plus the inset. A
 *   HUD piece keeps its gap from the edge of what is safe, so on desktop it
 *   sits exactly where its constants in `hudLayout.ts` put it, and under a
 *   notch it moves in by the whole inset. Placements worked out in script
 *   (`useSafeAreaInsets`: the harbour link, ship tooltips, port labels) add
 *   the insets the same way.
 * - The Harbour launcher's shell, and what is dressed like it (the rotate
 *   gate), takes the larger (`shellSafeInset`, Tailwind's
 *   `max(12px,env(safe-area-inset-*))`): its margin, or the inset where the
 *   inset is bigger. Its timber and parchment frame the screen and may run
 *   into the rounded corners; only its content must clear the notch.
 */

export type SafeAreaEdge = "top" | "right" | "bottom" | "left";

/** The insets in CSS pixels, as `useSafeAreaInsets` reads them, for placements worked out in script. */
export type SafeAreaInsets = Record<SafeAreaEdge, number>;

export const NO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

const env = (edge: SafeAreaEdge) => `env(safe-area-inset-${edge}, 0px)`;

/**
 * The HUD's rule, a CSS length: `px` in from the edge, plus that edge's
 * safe-area inset. For a HUD piece's `style`.
 */
export function safeInset(edge: SafeAreaEdge, px: number): string {
  return px === 0 ? env(edge) : `calc(${px}px + ${env(edge)})`;
}

/** The shell's rule, a CSS length: `px` from the edge, or that edge's safe-area inset where it is larger. */
export function shellSafeInset(edge: SafeAreaEdge, px: number): string {
  return px === 0 ? env(edge) : `max(${px}px, ${env(edge)})`;
}
