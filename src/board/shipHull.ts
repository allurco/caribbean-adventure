/**
 * The ships' hull boxes and how they sit on the water, drawn at twice true
 * scale for the 350 m hex (`SHIP_SCALE`, ADR 0003). Pure, no Three.js;
 * `Ship.tsx` draws them.
 */
import type { ShipClass } from "../game/types";
import { SHIP_SCALE } from "./visuals/worldScale";
import { type ShipModel, SHIP_MODELS, shipModelScale } from "./shipModels";

/** A hull box: width, height, length (world units). */
export type HullBox = readonly [number, number, number];

const scaled = (box: HullBox): HullBox => [box[0] * SHIP_SCALE, box[1] * SHIP_SCALE, box[2] * SHIP_SCALE];

/** A modelled class's hull: its model's beam, depth and length, at the model's scale. */
const modelBox = (model: ShipModel): HullBox => {
  const scale = shipModelScale();
  return [model.beamMetres * scale, model.depthMetres * scale, model.lengthMetres * scale];
};

/** The boxes authored for the 115 m hex, scaled by `SHIP_SCALE`, for the classes without a model. */
const AUTHORED_HULL_BOXES: Readonly<Record<ShipClass, HullBox>> = {
  Sloop: scaled([0.25, 0.2, 0.65]),
  Flute: scaled([0.4, 0.3, 0.6]),
  Frigate: scaled([0.35, 0.28, 0.7]),
  Galleon: scaled([0.5, 0.35, 0.8]),
};

const hullBoxFor = (shipClass: ShipClass): HullBox => {
  const model = SHIP_MODELS[shipClass];
  return model ? modelBox(model) : AUTHORED_HULL_BOXES[shipClass];
};

/** Each class's hull: from its model's dimensions (the catalogue) when it has one, else its authored box. */
export const SHIP_HULL_BOXES: Readonly<Record<ShipClass, HullBox>> = {
  Sloop: hullBoxFor("Sloop"),
  Flute: hullBoxFor("Flute"),
  Frigate: hullBoxFor("Frigate"),
  Galleon: hullBoxFor("Galleon"),
};

/** The hull of a ship without a class. */
export const DEFAULT_HULL_BOX: HullBox = scaled([0.3, 0.25, 0.7]);

/** The hull box for a ship of `shipClass`. */
export const shipHullBox = (shipClass: ShipClass | undefined): HullBox => (shipClass ? SHIP_HULL_BOXES[shipClass] : DEFAULT_HULL_BOX);

/** How far the hull box's centre rides above the sea. */
export const SHIP_RIDE_HEIGHT = 0.12 * SHIP_SCALE;
/** How far a sinking ship goes down. */
export const SHIP_SINK_DEPTH = 1.5 * SHIP_SCALE;
