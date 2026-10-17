import type { Hex } from "../game/hex";
import { hexToWorld } from "../game/hex";

/**
 * Where the camera looks at a player's own ship (#98): the opening view of
 * the main phase, and in hotseat play the flight to whoever's turn it is.
 */

/**
 * Camera-to-target distance of the ship view (ADR 0006): close enough that
 * about 2.2 hexes fill the screen top to bottom (`hexesFramed`), so the
 * diorama-scale ship, about half a hex long, is the subject. Its own
 * constant, apart from the zoom floor `CAMERA_MIN_DISTANCE`.
 */
export const SHIP_VIEW_DISTANCE = 3.4;

/**
 * How far east of the ship the ship view looks, world units (ADR 0006):
 * east is screen right, so the ship sits left of centre, in the middle of
 * the space the port panel leaves on a 16:9 screen.
 */
export const SHIP_VIEW_OFFSET_X = 0.6;

/**
 * How many hex rows a view `distance` from its focus frames top to bottom,
 * measured at the focus: the view's height there over a row's height on
 * screen (√3 on the sea, foreshortened by the pitch).
 */
export function hexesFramed(distance: number, fovDeg: number, pitch: number): number {
  const height = 2 * distance * Math.tan(((fovDeg / 2) * Math.PI) / 180);
  return height / (Math.sqrt(3) * Math.sin(pitch));
}

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

/**
 * Where the camera flies when the turn passes: in hotseat play the new
 * current player's ship at ship zoom. Null, so the camera stays put, for a
 * networked client (its own ship does not change with the turn) and when
 * that ship is missing.
 */
export function turnChangeView(input: ShipViewInput): CameraView | null {
  if (input.playerID != null) return null;
  return shipView(input);
}

/**
 * Where the camera flies once a seat that lost its ship has picked a new
 * captain (#286): the new ship at its home port, at ship zoom. In networked
 * play only for the seat that picked, its own ship being the new one; every
 * other seat's camera stays put. Null too when the ship is missing.
 */
export function newCaptainView(input: ShipViewInput): CameraView | null {
  if (input.playerID != null && input.playerID !== input.currentPlayer) return null;
  return shipView({ ...input, playerID: null });
}

/** The ship view of the viewer's own ship, or null when it has none. */
function shipView({ ships, currentPlayer, playerID }: ShipViewInput): CameraView | null {
  const ship = ships[playerID ?? currentPlayer];
  if (!ship) return null;
  const [x, y, z] = hexToWorld(ship.position);
  return { target: [x + SHIP_VIEW_OFFSET_X, y, z], distance: SHIP_VIEW_DISTANCE };
}
