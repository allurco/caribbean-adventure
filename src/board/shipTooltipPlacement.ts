/**
 * Where a ship's tooltip is drawn on screen (#199). Pure: screen points in
 * CSS pixels from the canvas's top-left corner, no React or Three.js.
 *
 * By default it stands just over the masthead, centred on the ship, so it
 * never covers the ship (ADR 0006). When the ship is so near the top of the
 * screen that the tooltip would reach the HUD's top bar, it flips below the
 * ship's waterline; when there is room for neither, it is held just below the
 * bar. Port labels keep clear of the bar the same way (`portLabel.ts`).
 * Under a notch (#123) every margin moves in by the screen's safe-area
 * insets, as the HUD's pieces do: the bar sits lower by the top inset.
 */
import { HUD_TOP_BAR_HEIGHT } from "./hudLayout";
import { NO_INSETS, type SafeAreaInsets } from "./safeArea";

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

/** Gap kept between the tooltip and the HUD's top bar, in CSS pixels. */
export const SHIP_TOOLTIP_HUD_GAP = 4;
/** Highest a tooltip's top edge may be: the bar plus the gap. */
export const SHIP_TOOLTIP_TOP_MARGIN = HUD_TOP_BAR_HEIGHT + SHIP_TOOLTIP_HUD_GAP;
/** Gap kept between a flipped tooltip and the ship's waterline, in CSS pixels. */
export const SHIP_TOOLTIP_SHIP_GAP = 8;
/** Least gap kept between the tooltip and the viewport's left and right edges, in CSS pixels. */
export const SHIP_TOOLTIP_SIDE_MARGIN = 8;

export type ShipTooltipSide = "above" | "below" | "clamped";

export interface ShipTooltipPlacement {
  /** The tooltip's top-left corner, in CSS pixels. */
  readonly left: number;
  readonly top: number;
  /** Over the masthead, flipped under the waterline, or held under the bar. */
  readonly side: ShipTooltipSide;
}

export interface ShipTooltipPlacementInput {
  /** The masthead (with its clearance) on screen: the default anchor, the tooltip's bottom centre. */
  readonly masthead: ScreenPoint;
  /** Where the hull meets the water on screen: a flipped tooltip hangs below it. */
  readonly waterline: ScreenPoint;
  /** The tooltip's measured size. */
  readonly tooltip: ScreenSize;
  /** The canvas's size. */
  readonly viewport: ScreenSize;
  /** The screen's safe-area insets (`useSafeAreaInsets`); none when left out. */
  readonly insets?: SafeAreaInsets;
}

export function placeShipTooltip({ masthead, waterline, tooltip, viewport, insets = NO_INSETS }: ShipTooltipPlacementInput): ShipTooltipPlacement {
  const topMargin = SHIP_TOOLTIP_TOP_MARGIN + insets.top;
  const bottom = viewport.height - insets.bottom;
  const clamp = (centreX: number) => clampHorizontally(centreX - tooltip.width / 2, tooltip.width, viewport.width, insets);
  const left = clamp(masthead.x);
  const above = masthead.y - tooltip.height;
  if (above >= topMargin) return { left, top: above, side: "above" };
  const below = waterline.y + SHIP_TOOLTIP_SHIP_GAP;
  if (below >= topMargin && below + tooltip.height <= bottom) {
    return { left: clamp(waterline.x), top: below, side: "below" };
  }
  return { left, top: topMargin, side: "clamped" };
}

/** `left` moved so a tooltip `width` wide stays inside the viewport's side margins and insets (the left one wins when it cannot fit). */
function clampHorizontally(left: number, width: number, viewportWidth: number, insets: SafeAreaInsets): number {
  const min = SHIP_TOOLTIP_SIDE_MARGIN + insets.left;
  const max = viewportWidth - SHIP_TOOLTIP_SIDE_MARGIN - insets.right - width;
  return Math.max(min, Math.min(left, max));
}

/** A point in normalised device coordinates (−1 … 1, y up) on the canvas, in CSS pixels from its top-left corner, as drei's `Html` places its anchor. */
export function ndcToScreen(ndc: { readonly x: number; readonly y: number }, viewport: ScreenSize): ScreenPoint {
  return { x: ((ndc.x + 1) / 2) * viewport.width, y: ((1 - ndc.y) / 2) * viewport.height };
}

/** How far the tooltip's top-left corner is moved from the screen point `anchor` it is drawn at. */
export function placementOffset(placement: ShipTooltipPlacement, anchor: ScreenPoint): ScreenPoint {
  return { x: placement.left - anchor.x, y: placement.top - anchor.y };
}
