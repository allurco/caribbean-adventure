/**
 * The ships' hull boxes, their hover boxes and how they sit on the water,
 * drawn at the diorama ship scale (`SHIP_SCALE`, ADR 0006). Pure, no
 * Three.js; `Ship.tsx` draws them.
 */
import type { ShipClass } from "../game/types";
import { SHIP_SCALE } from "./visuals/worldScale";
import { type ShipModel, SHIP_MODELS, shipModelDraftUnits, shipModelScale } from "./shipModels";

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

/**
 * Height of a ship's group above the sea level it is placed at: none. The
 * group stands on the sea at the ship's waterline, so the wave pose (#142)
 * heaves, pitches and rolls the hull about its waterline, and a model, whose
 * origin is its waterline, sits in it as it is (#150).
 */
export const SHIP_WATERLINE_Y = 0;
/** How far the hull box's centre rides above the ship's waterline: the box alone; a model sits on its waterline (`shipModelPlacement`). */
export const SHIP_RIDE_HEIGHT = 0.12 * SHIP_SCALE;
/** How far a sinking ship goes down. */
export const SHIP_SINK_DEPTH = 1.5 * SHIP_SCALE;

/**
 * How far inside a hex's inradius every hull box's footprint stays, at any
 * heading, in world units (ADR 0006): room for the bowsprit, the hull foam
 * and a neighbour's hull, so a ship reads as on its own hex.
 */
export const HULL_FIT_MARGIN = 0.25;

/** How far the farthest corner of a hull box's footprint reaches from its centre: its reach at the worst heading. */
export const hullFootprintRadius = (box: HullBox): number => Math.hypot(box[0] / 2, box[2] / 2);

/**
 * What the pointer hits for a ship (ADR 0006): its hull's footprint, from
 * the keel up to the masthead, so hovering the topsails, or the gaps between
 * them, hits the ship. Heights from the ship's waterline, the origin of its
 * group (`SHIP_WATERLINE_Y`, #150).
 */
export interface HoverBox {
  readonly width: number;
  readonly length: number;
  readonly bottom: number;
  readonly top: number;
}

export const shipHoverBox = (shipClass: ShipClass | undefined): HoverBox => {
  const [width, height, length] = shipHullBox(shipClass);
  const model = shipClass ? SHIP_MODELS[shipClass] : null;
  // The box hull rides SHIP_RIDE_HEIGHT above the waterline; a model's keel is its draft under it.
  if (!model) return { width, length, bottom: SHIP_RIDE_HEIGHT - height / 2, top: SHIP_RIDE_HEIGHT + height / 2 };
  return { width, length, bottom: -shipModelDraftUnits(model), top: model.mastheadMetres * shipModelScale() };
};

/** World units between a ship's masthead and the bottom edge of its tooltip. */
export const SHIP_TOOLTIP_CLEARANCE = 0.08;

/** How high above the sea a ship's tooltip stands: its bottom edge just over the masthead (ADR 0006). */
export const shipTooltipHeight = (shipClass: ShipClass | undefined): number => shipHoverBox(shipClass).top + SHIP_TOOLTIP_CLEARANCE;

/**
 * Where a hull meets the water, for its contact foam (hullContact.ts, #144):
 * the waterline's length and beam in world units and how round its ends are
 * (0 square … 1 a stadium).
 */
export interface Waterline {
  readonly length: number;
  readonly beam: number;
  readonly roundness: number;
}

/**
 * STYLISTIC: a modelled hull's waterline against its overall length and
 * greatest beam. The stem and the stern rake out over the water and the
 * sides tumble home above it, so the waterline is a little shorter and
 * narrower; the contact foam is full under the outline, so a waterline a
 * little small never leaves a gap, where one too big would float foam off
 * the hull.
 */
export const WATERLINE_LENGTH_SHARE = 0.88;
export const WATERLINE_BEAM_SHARE = 0.92;
/** A box hull's footprint is its waterline: square ends, barely rounded. */
const BOX_WATERLINE_ROUNDNESS = 0.15;

/** The waterline of a ship of `shipClass`: its model's, from the hull box, or the box's own footprint. */
export const shipWaterline = (shipClass: ShipClass | undefined): Waterline => {
  const [width, , length] = shipHullBox(shipClass);
  const model = shipClass ? SHIP_MODELS[shipClass] : null;
  if (!model) return { length, beam: width, roundness: BOX_WATERLINE_ROUNDNESS };
  return { length: length * WATERLINE_LENGTH_SHARE, beam: width * WATERLINE_BEAM_SHARE, roundness: 1 };
};
