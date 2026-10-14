import { describe, expect, it } from "vitest";
import { HUD_TOP_BAR_HEIGHT } from "./hudLayout";
import {
  ndcToScreen,
  placementOffset,
  placeShipTooltip,
  SHIP_TOOLTIP_HUD_GAP,
  SHIP_TOOLTIP_SHIP_GAP,
  SHIP_TOOLTIP_SIDE_MARGIN,
  SHIP_TOOLTIP_TOP_MARGIN,
} from "./shipTooltipPlacement";

const viewport = { width: 1600, height: 1000 };
const tooltip = { width: 180, height: 90 };

/** A ship whose masthead is `y` px down the screen, its waterline 60 px below that. */
const shipAt = (x: number, y: number) => ({ masthead: { x, y }, waterline: { x, y: y + 60 } });

describe("placeShipTooltip (#199)", () => {
  it("keeps clear of the HUD's top bar by a small gap", () => {
    expect(SHIP_TOOLTIP_HUD_GAP).toBeGreaterThan(0);
    expect(SHIP_TOOLTIP_TOP_MARGIN).toBe(HUD_TOP_BAR_HEIGHT + SHIP_TOOLTIP_HUD_GAP);
  });

  it("stands just over the masthead, centred on it, when there is room", () => {
    const placed = placeShipTooltip({ ...shipAt(800, 500), tooltip, viewport });
    expect(placed).toEqual({ left: 800 - 90, top: 500 - 90, side: "above" });
  });

  it("stays over the masthead while its top just clears the bar", () => {
    const y = SHIP_TOOLTIP_TOP_MARGIN + tooltip.height;
    expect(placeShipTooltip({ ...shipAt(800, y), tooltip, viewport })).toMatchObject({ top: SHIP_TOOLTIP_TOP_MARGIN, side: "above" });
  });

  it("flips below the ship when the masthead is within the tooltip's height of the bar", () => {
    const y = SHIP_TOOLTIP_TOP_MARGIN + tooltip.height - 1;
    const ship = shipAt(800, y);
    const placed = placeShipTooltip({ ...ship, tooltip, viewport });
    expect(placed.side).toBe("below");
    expect(placed.top).toBe(ship.waterline.y + SHIP_TOOLTIP_SHIP_GAP);
    expect(placed.left).toBe(800 - 90);
  });

  it("is held just below the bar when there is room for neither", () => {
    // A tall tooltip on a short screen: over the masthead it reaches the bar, under the hull it runs off the bottom.
    const tall = { width: 180, height: 400 };
    const short = { width: 1600, height: 600 };
    const placed = placeShipTooltip({ ...shipAt(800, 200), tooltip: tall, viewport: short });
    expect(placed).toMatchObject({ top: SHIP_TOOLTIP_TOP_MARGIN, side: "clamped" });
    // A ship whose waterline is itself under the bar.
    const hidden = placeShipTooltip({ masthead: { x: 800, y: -40 }, waterline: { x: 800, y: 20 }, tooltip, viewport });
    expect(hidden).toMatchObject({ top: SHIP_TOOLTIP_TOP_MARGIN, side: "clamped" });
  });

  it("never puts its top above the bar plus the gap", () => {
    for (let y = -200; y <= 1100; y += 7) {
      for (const height of [40, 90, 200, 600]) {
        const placed = placeShipTooltip({ ...shipAt(800, y), tooltip: { width: 180, height }, viewport });
        expect(placed.top).toBeGreaterThanOrEqual(SHIP_TOOLTIP_TOP_MARGIN);
      }
    }
  });

  it("stays inside the viewport on the left and the right", () => {
    for (let x = -300; x <= 1900; x += 13) {
      for (const y of [30, 120, 500]) {
        const placed = placeShipTooltip({ ...shipAt(x, y), tooltip, viewport });
        expect(placed.left).toBeGreaterThanOrEqual(SHIP_TOOLTIP_SIDE_MARGIN);
        expect(placed.left + tooltip.width).toBeLessThanOrEqual(viewport.width - SHIP_TOOLTIP_SIDE_MARGIN);
      }
    }
    expect(placeShipTooltip({ ...shipAt(20, 500), tooltip, viewport }).left).toBe(SHIP_TOOLTIP_SIDE_MARGIN);
    expect(placeShipTooltip({ ...shipAt(1590, 500), tooltip, viewport }).left).toBe(1600 - SHIP_TOOLTIP_SIDE_MARGIN - 180);
  });
});

describe("ndcToScreen", () => {
  it("maps the canvas's corners and centre to CSS pixels, y down", () => {
    expect(ndcToScreen({ x: -1, y: 1 }, viewport)).toEqual({ x: 0, y: 0 });
    expect(ndcToScreen({ x: 1, y: -1 }, viewport)).toEqual({ x: 1600, y: 1000 });
    expect(ndcToScreen({ x: 0, y: 0 }, viewport)).toEqual({ x: 800, y: 500 });
  });
});

describe("placementOffset", () => {
  it("is the move from the anchor to the tooltip's top-left corner", () => {
    expect(placementOffset({ left: 710, top: 410, side: "above" }, { x: 800, y: 560 })).toEqual({ x: -90, y: -150 });
  });
});
