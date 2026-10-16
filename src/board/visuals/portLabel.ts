/**
 * How a port's floating name label sits, sizes and fades with the camera
 * (#75). Pure, no Three.js.
 *
 * The label is sized for map zoom: there it finds the port at a glance. Left
 * to perspective it grew with every step closer, until at the ship-zoom floor
 * it filled a third of the screen and lay across the settlement. So:
 *
 * - Size: its glyphs never grow past `PORT_LABEL_MAX_PX` on screen, nor
 *   shrink below `PORT_LABEL_MIN_PX` far out (#151), so every name reads at a
 *   glance at the overview. In between it is drawn as before.
 * - Facing: the text is turned about its baseline to face the camera
 *   (`portLabelViewPitch`); upright, it was foreshortened by the look down.
 * - Lift: its baseline sits above every building's roof, raised far enough
 *   that, seen down the camera's pitch, it also clears the buildings behind
 *   the port's centre, so it never sits across the settlement (the quay and
 *   pier are lower and nearer the water than any roof).
 * - Fade: close in, where the buildings name the port on their own, it fades
 *   to `PORT_LABEL_MIN_OPACITY`, and out entirely at town zoom (#90);
 *   hovering the port brings it back, short of town zoom.
 * - Clamp: the lift can carry it off the top of the screen at ship zoom while
 *   the port is still in view, so it is brought back down inside the edge.
 * - Anchor: over the middle of the port's own buildings (`portLabelAnchor`),
 *   and the lift is worked out for the pitch the camera actually looks down
 *   at, so the label stays on its town at every angle (#151).
 */

import { CAMERA_PITCH } from "../cameraBounds";
import { HUD_TOP_BAR_HEIGHT } from "../hudLayout";
import { buildingReachOf, buildingTopOf, portOwnBuildings, type TownBuilding } from "./portHover";
import type { PortBuilding } from "./portSettlement";

/** The label's font size in world units: its size at map zoom. */
export const PORT_LABEL_FONT_SIZE = 0.4;
/** Largest on-screen font size, in CSS pixels: the size it has at ship zoom, about the HUD's headings. */
export const PORT_LABEL_MAX_PX = 22;
/** Smallest on-screen font size, in CSS pixels: about the HUD's small print, readable at a glance (#151). */
export const PORT_LABEL_MIN_PX = 14;
/**
 * The old fixed baseline over the ground, kept as the lowest the label sits
 * at the game's pitch (`CAMERA_PITCH`). Seen lower down it is shortened so
 * the baseline stays as far across the ground from the port, inside its hex
 * (see `portLabelBaseY`); seen steeper it stays this height.
 */
export const PORT_LABEL_MIN_HEIGHT = 0.6;
/** The flattest look `portLabelViewPitch` reports, radians, so a grazing view never divides by zero. */
export const PORT_LABEL_MIN_VIEW_PITCH = (2 * Math.PI) / 180;
/**
 * The steepest look `portLabelViewPitch` reports, radians: 70°, steeper than
 * the overview camera's look at its focus (about 64°). Seen straight down no
 * lift can clear a roof behind the anchor (the rise per unit north,
 * tan(pitch), grows without bound), and a port south of the camera would read
 * as straight down too, so the pitch stops here and the lift stays finite.
 */
export const PORT_LABEL_MAX_VIEW_PITCH = (70 * Math.PI) / 180;
/** Air between a building's projected top and the label's baseline, in world units. */
export const PORT_LABEL_LIFT_MARGIN = 0.08;
/** Camera-to-label distance at and beyond which the label is fully opaque. */
export const PORT_LABEL_FADE_FAR = 9;
/** Camera-to-label distance at and within which the label is at its faintest. */
export const PORT_LABEL_FADE_NEAR = 5.5;
/** The faintest the label gets at ship zoom (close in, not hovered): still readable over shore foam. */
export const PORT_LABEL_MIN_OPACITY = 0.35;
/**
 * Camera-to-label distance at and beyond which the label keeps its ship-zoom
 * floor (`PORT_LABEL_MIN_OPACITY`). At the old ship-zoom floor (camera 4.32
 * from its focus) the label is about 3.8 away, so ship zoom is unchanged.
 */
export const PORT_LABEL_TOWN_FADE_FAR = 3;
/**
 * Camera-to-label distance at and within which the label is gone (#90): at
 * town zoom the camera is among the roofs, the label would hang over the
 * streets (or be pinned to the top edge by the clamp), and the town names
 * itself. Hovering does not bring it back here (see `portLabelOpacity`).
 */
export const PORT_LABEL_TOWN_FADE_NEAR = 2;

/**
 * World units per CSS pixel at `distance` from a perspective camera with
 * vertical field of view `fovDeg` drawing into `viewportHeightPx`.
 */
export function worldUnitsPerPixel(distance: number, fovDeg: number, viewportHeightPx: number): number {
  const visibleHeight = 2 * distance * Math.tan(((fovDeg / 2) * Math.PI) / 180);
  return visibleHeight / viewportHeightPx;
}

/**
 * The scale applied to the label so its font is never more than
 * `PORT_LABEL_MAX_PX` on screen (close in) nor less than `PORT_LABEL_MIN_PX`
 * (far out, #151). 1 wherever the label already falls between the two (map
 * zoom), so the map view is unchanged.
 */
export function portLabelScale(distance: number, fovDeg: number, viewportHeightPx: number): number {
  if (!(distance > 0) || !(viewportHeightPx > 0)) return 1;
  const unitsPerPx = worldUnitsPerPixel(distance, fovDeg, viewportHeightPx);
  const maxScale = (PORT_LABEL_MAX_PX * unitsPerPx) / PORT_LABEL_FONT_SIZE;
  const minScale = (PORT_LABEL_MIN_PX * unitsPerPx) / PORT_LABEL_FONT_SIZE;
  return Math.min(maxScale, Math.max(minScale, 1));
}

/**
 * How steeply, radians, the camera at `camera` looks down at `point` (both
 * y up, z toward the camera: it looks due north, cameraBounds.ts), between
 * `PORT_LABEL_MIN_VIEW_PITCH` and `PORT_LABEL_MAX_VIEW_PITCH` (a port
 * straight below the camera, or south of it, gets the cap). The label is turned by it
 * to face the camera, and its lift is worked out for it.
 */
export function portLabelViewPitch(camera: { y: number; z: number }, point: { y: number; z: number }): number {
  const pitch = Math.atan2(camera.y - point.y, Math.max(0, camera.z - point.z));
  return Math.min(PORT_LABEL_MAX_VIEW_PITCH, Math.max(PORT_LABEL_MIN_VIEW_PITCH, pitch));
}

/**
 * Where the label of the port at `centre` stands across the ground: over the
 * middle of the port's own buildings, the town the name belongs to, or the
 * port's centre when it has none.
 */
export function portLabelAnchor(centre: { x: number; z: number }, buildings: readonly PortBuilding[]): { x: number; z: number } {
  const own = portOwnBuildings(centre, buildings);
  if (own.length === 0) return { x: centre.x, z: centre.z };
  let x = 0;
  let z = 0;
  for (const b of own) {
    x += b.worldX;
    z += b.worldZ;
  }
  return { x: x / own.length, z: z / own.length };
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
 * Looked at lower than the game's pitch, that floor is shortened in step with
 * tan(pitch), so it is seen no further across the ground from the port: a
 * fixed height seen at a low angle would put the label out over the sea (#151).
 */
export function portLabelBaseY(
  centre: { x: number; z: number },
  groundY: number,
  buildings: readonly TownBuilding[],
  pitch: number
): number {
  return portLabelLiftOver(centre, groundY, portOwnBuildings(centre, buildings), pitch);
}

/**
 * `portLabelBaseY` for buildings already known to be the port's own, measured
 * from `anchor` (which may sit off the port's centre, `portLabelAnchor`).
 */
export function portLabelLiftOver(
  anchor: { x: number; z: number },
  groundY: number,
  ownBuildings: readonly TownBuilding[],
  pitch: number
): number {
  // Held inside the pitches `portLabelViewPitch` reports, so tan stays finite
  const rise = Math.tan(Math.min(PORT_LABEL_MAX_VIEW_PITCH, Math.max(PORT_LABEL_MIN_VIEW_PITCH, pitch)));
  const floorScale = Math.min(1, rise / Math.tan(CAMERA_PITCH));
  let base = groundY + PORT_LABEL_MIN_HEIGHT * floorScale;
  for (const b of ownBuildings) {
    // A village house by its own model (#176): the town's houses stand taller than the kit's.
    const top = buildingTopOf(b);
    const north = anchor.z - b.worldZ + buildingReachOf(b);
    base = Math.max(base, top + Math.max(0, north) * rise + PORT_LABEL_LIFT_MARGIN);
  }
  return base;
}

/**
 * The label's opacity at `distance` from the camera: 1 from
 * `PORT_LABEL_FADE_FAR` out, easing to `PORT_LABEL_MIN_OPACITY` at
 * `PORT_LABEL_FADE_NEAR` and closer, then from `PORT_LABEL_TOWN_FADE_FAR`
 * on out to nothing at `PORT_LABEL_TOWN_FADE_NEAR` (town zoom, #90). Hovering
 * the port brings it back to 1, except at town zoom: there one hex fills the
 * screen, so the pointer rests on the port nearly all the time, and the town
 * fade applies all the same.
 */
export function portLabelOpacity(distance: number, hovered: boolean): number {
  const town = Math.min(
    1,
    Math.max(0, (distance - PORT_LABEL_TOWN_FADE_NEAR) / (PORT_LABEL_TOWN_FADE_FAR - PORT_LABEL_TOWN_FADE_NEAR))
  );
  const townEased = town * town * (3 - 2 * town);
  if (hovered) return townEased;
  const t = Math.min(1, Math.max(0, (distance - PORT_LABEL_FADE_NEAR) / (PORT_LABEL_FADE_FAR - PORT_LABEL_FADE_NEAR)));
  const eased = t * t * (3 - 2 * t);
  return (PORT_LABEL_MIN_OPACITY + (1 - PORT_LABEL_MIN_OPACITY) * eased) * townEased;
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
  /** The screen's top safe-area inset (#123), which pushes the turn bar down; 0 when left out. */
  insetTop?: number;
}

/**
 * How far down, in CSS pixels (≥ 0), to move a label so its top stays
 * `PORT_LABEL_VIEWPORT_MARGIN` inside the viewport's top edge. The lift that
 * clears the roofs can carry it off the top at ship zoom while the port is
 * still in view. It never comes down past the port it names, so a label whose
 * port is itself off the top goes off with it instead of sticking to the edge.
 */
export function portLabelScreenShift({ baselineY, topY, portY, insetTop = 0 }: PortLabelScreen): number {
  const needed = PORT_LABEL_VIEWPORT_MARGIN + insetTop - topY;
  const room = portY - baselineY;
  return Math.max(0, Math.min(needed, room));
}
