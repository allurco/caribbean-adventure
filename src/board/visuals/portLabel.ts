/**
 * How a port's floating name label sits, sizes and fades with the camera
 * (#75). Pure, no Three.js.
 *
 * The label is sized for map zoom: there it finds the port at a glance. Left
 * to perspective it grew with every step closer, until at the ship-zoom floor
 * it filled a third of the screen and lay across the settlement. So:
 *
 * - Size: its glyphs never grow past `PORT_LABEL_MAX_PX` on screen. At map
 *   zoom the label is smaller than that and is drawn as before.
 * - Lift: its baseline sits above every building's roof, raised far enough
 *   that, seen down the camera's pitch, it also clears the buildings behind
 *   the port's centre, so it never sits across the settlement (the quay and
 *   pier are lower and nearer the water than any roof).
 * - Fade: close in, where the buildings name the port on their own, it fades
 *   to `PORT_LABEL_MIN_OPACITY`; hovering the port brings it back.
 * - Clamp: the lift can carry it off the top of the screen at ship zoom while
 *   the port is still in view, so it is brought back down inside the edge.
 */

import { HUD_TOP_BAR_HEIGHT } from "../hudLayout";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_HEIGHT } from "./agedBuildingGeometry";
import { portOwnBuildings } from "./portHover";
import type { PortBuilding } from "./portSettlement";

/** The label's font size in world units: its size at map zoom. */
export const PORT_LABEL_FONT_SIZE = 0.4;
/** Largest on-screen font size, in CSS pixels: about the HUD's headings. */
export const PORT_LABEL_MAX_PX = 24;
/** The old fixed baseline over the ground, kept as the lowest the label sits. */
export const PORT_LABEL_MIN_HEIGHT = 0.6;
/** Air between a building's projected top and the label's baseline, in world units. */
export const PORT_LABEL_LIFT_MARGIN = 0.08;
/** Camera-to-label distance at and beyond which the label is fully opaque. */
export const PORT_LABEL_FADE_FAR = 9;
/** Camera-to-label distance at and within which the label is at its faintest. */
export const PORT_LABEL_FADE_NEAR = 5.5;
/** The faintest the label gets (close in, not hovered): still readable over shore foam. */
export const PORT_LABEL_MIN_OPACITY = 0.35;

/**
 * World units per CSS pixel at `distance` from a perspective camera with
 * vertical field of view `fovDeg` drawing into `viewportHeightPx`.
 */
export function worldUnitsPerPixel(distance: number, fovDeg: number, viewportHeightPx: number): number {
  const visibleHeight = 2 * distance * Math.tan(((fovDeg / 2) * Math.PI) / 180);
  return visibleHeight / viewportHeightPx;
}

/**
 * The scale (at most 1) applied to the label so its font is never more than
 * `PORT_LABEL_MAX_PX` on screen. 1 wherever the label is already smaller
 * than that (map zoom), so the map view is unchanged.
 */
export function portLabelScale(distance: number, fovDeg: number, viewportHeightPx: number): number {
  if (!(distance > 0) || !(viewportHeightPx > 0)) return 1;
  const maxWorldFont = PORT_LABEL_MAX_PX * worldUnitsPerPixel(distance, fovDeg, viewportHeightPx);
  return Math.min(1, maxWorldFont / PORT_LABEL_FONT_SIZE);
}

/**
 * The label's baseline height over a port at `centre` whose probed ground is
 * `groundY`. The camera looks due north (−z) and down at `pitch`, so a point
 * `n` further north across the ground appears `n·tan(pitch)` higher on screen
 * than one at the same height over the centre. Each of the port's own
 * buildings therefore lifts the baseline to its roof top plus that rise for
 * its farthest-north corner, so no building or tower reaches up into the
 * label; never below the old fixed baseline (`PORT_LABEL_MIN_HEIGHT` over the
 * ground), so a port's label sits where it always did when nothing is in the way.
 */
export function portLabelBaseY(
  centre: { x: number; z: number },
  groundY: number,
  buildings: readonly PortBuilding[],
  pitch: number
): number {
  const rise = Math.tan(pitch);
  let base = groundY + PORT_LABEL_MIN_HEIGHT;
  for (const b of portOwnBuildings(centre, buildings)) {
    const top = b.worldY + AGED_BUILDING_HEIGHT[b.kind] * b.scale;
    const north = centre.z - b.worldZ + AGED_BUILDING_HALF_DIAGONAL[b.kind] * b.scale;
    base = Math.max(base, top + Math.max(0, north) * rise + PORT_LABEL_LIFT_MARGIN);
  }
  return base;
}

/**
 * The label's opacity at `distance` from the camera: 1 from
 * `PORT_LABEL_FADE_FAR` out, easing to `PORT_LABEL_MIN_OPACITY` at
 * `PORT_LABEL_FADE_NEAR` and closer. Always 1 while the port is hovered.
 */
export function portLabelOpacity(distance: number, hovered: boolean): number {
  if (hovered) return 1;
  const t = Math.min(1, Math.max(0, (distance - PORT_LABEL_FADE_NEAR) / (PORT_LABEL_FADE_FAR - PORT_LABEL_FADE_NEAR)));
  const eased = t * t * (3 - 2 * t);
  return PORT_LABEL_MIN_OPACITY + (1 - PORT_LABEL_MIN_OPACITY) * eased;
}

/** Air, in CSS pixels, between the bottom of the HUD's top bar and a label's top. */
export const PORT_LABEL_HUD_GAP = 4;

/**
 * Smallest gap, in CSS pixels, kept between a label's top and the viewport's
 * top edge: the HUD's top bar (glory, gold, moves) plus `PORT_LABEL_HUD_GAP`,
 * so the label is never drawn under the bar.
 */
export const PORT_LABEL_VIEWPORT_MARGIN = HUD_TOP_BAR_HEIGHT + PORT_LABEL_HUD_GAP;

/** Screen positions (CSS pixels down from the viewport's top) of a label and the port it names. */
export interface PortLabelScreen {
  /** The label's baseline. */
  baselineY: number;
  /** The top of its glyphs. */
  topY: number;
  /** The port's ground point under the label. */
  portY: number;
}

/**
 * How far down, in CSS pixels (≥ 0), to move a label so its top stays
 * `PORT_LABEL_VIEWPORT_MARGIN` inside the viewport's top edge. The lift that
 * clears the roofs can carry it off the top at ship zoom while the port is
 * still in view. It never comes down past the port it names, so a label whose
 * port is itself off the top goes off with it instead of sticking to the edge.
 */
export function portLabelScreenShift({ baselineY, topY, portY }: PortLabelScreen): number {
  const needed = PORT_LABEL_VIEWPORT_MARGIN - topY;
  const room = portY - baselineY;
  return Math.max(0, Math.min(needed, room));
}
