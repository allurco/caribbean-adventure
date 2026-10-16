/**
 * The safe areas (#123): with `viewport-fit=cover` the page runs under a
 * phone's notch and rounded corners, so the HUD pads by
 * `env(safe-area-inset-*)`. A desktop browser reports zero insets, so the
 * HUD there sits exactly where its constants in `hudLayout.ts` put it.
 * Pure, no React.
 */

export type SafeAreaEdge = "top" | "right" | "bottom" | "left";

/** The insets in CSS pixels, as `useSafeAreaInsets` reads them, for placements worked out in script. */
export type SafeAreaInsets = Record<SafeAreaEdge, number>;

export const NO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * A CSS length: `px` in from the edge, plus that edge's safe-area inset. For
 * a HUD piece's `style`; zero on desktop, where the browser reports no insets.
 */
export function safeInset(edge: SafeAreaEdge, px: number): string {
  const inset = `env(safe-area-inset-${edge}, 0px)`;
  return px === 0 ? inset : `calc(${px}px + ${inset})`;
}
