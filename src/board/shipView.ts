import type { Hex } from "../game/hex";
import { hexToWorld } from "../game/hex";

/**
 * Where the camera looks at a player's own ship (#98): the opening view of
 * the main phase, and in hotseat play the flight to whoever's turn it is.
 */

/**
 * Camera-to-target distance of the ship view. Today's zoom floor, but its own
 * constant: `CAMERA_MIN_DISTANCE` may go lower (#90) without pulling the
 * opening view in with it.
 */
export const SHIP_VIEW_DISTANCE = 4.32;

/** A camera view: the focus on the sea plane and the distance to it. */
export interface CameraView {
  target: [number, number, number];
  distance: number;
}

export interface ShipViewInput {
  ships: Readonly<Record<string, { position: Hex }>>;
  /** `ctx.currentPlayer`. */
  currentPlayer: string;
  /** The client's seat in networked play; null or undefined in hotseat. */
  playerID?: string | null;
}

export interface OpeningViewInput extends ShipViewInput {
  /** The map-wide view to fall back on: the map's middle at its iso distance. */
  mapView: CameraView;
  /** The dev URL pins (`cx`/`cz`, `dist`; #74): each wins over the view it pins. */
  pins?: Partial<CameraView>;
}

/**
 * The first view of the main phase: the viewer's own ship at ship zoom, or
 * the map view when that ship is missing. The dev pins win, each on its own,
 * so a URL still reproduces a screenshot.
 */
export function openingView({ mapView, pins, ...input }: OpeningViewInput): CameraView {
  const view = shipView(input) ?? mapView;
  return { target: pins?.target ?? view.target, distance: pins?.distance ?? view.distance };
}

/** The ship view of the viewer's own ship, or null when it has none. */
function shipView({ ships, currentPlayer, playerID }: ShipViewInput): CameraView | null {
  const ship = ships[playerID ?? currentPlayer];
  if (!ship) return null;
  return { target: hexToWorld(ship.position), distance: SHIP_VIEW_DISTANCE };
}
