/**
 * The ships' hull boxes and how they sit on the water, drawn at twice true
 * scale for the 350 m hex (`SHIP_SCALE`, ADR 0003). Pure, no Three.js;
 * `Ship.tsx` draws them.
 */
import type { ShipClass } from "../game/types";
import { SHIP_SCALE } from "./visuals/worldScale";

/** A hull box: width, height, length (world units). */
export type HullBox = readonly [number, number, number];

const scaled = (box: HullBox): HullBox => [box[0] * SHIP_SCALE, box[1] * SHIP_SCALE, box[2] * SHIP_SCALE];

/** Each class's hull, authored for the 115 m hex and scaled by `SHIP_SCALE`. */
export const SHIP_HULL_BOXES: Readonly<Record<ShipClass, HullBox>> = {
  Sloop: scaled([0.25, 0.2, 0.65]),
  Flute: scaled([0.4, 0.3, 0.6]),
  Frigate: scaled([0.35, 0.28, 0.7]),
  Galleon: scaled([0.5, 0.35, 0.8]),
};

/** The hull of a ship without a class. */
export const DEFAULT_HULL_BOX: HullBox = scaled([0.3, 0.25, 0.7]);

/** The hull box for a ship of `shipClass`. */
export const shipHullBox = (shipClass: ShipClass | undefined): HullBox => (shipClass ? SHIP_HULL_BOXES[shipClass] : DEFAULT_HULL_BOX);

/** How far the hull box's centre rides above the sea. */
export const SHIP_RIDE_HEIGHT = 0.12 * SHIP_SCALE;
/** How far a sinking ship goes down. */
export const SHIP_SINK_DEPTH = 1.5 * SHIP_SCALE;
