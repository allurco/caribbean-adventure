/**
 * The ship model catalogue (#130): which classes are drawn with a generated
 * model from `public/ships/`, and how that model is sized and turned onto
 * the board. Pure, no Three.js; `Ship.tsx` draws them, and the ship asset
 * test keeps the catalogue in step with the files.
 *
 * The generator's contract (ADR 0002, `boats/`): real metres, the origin at
 * the waterline amidships, the bow along glTF −Z.
 */
import type { ShipClass } from "../game/types";
import { SHIP_SCALE, metresToUnits } from "./visuals/worldScale";

/** The model parts the game relies on, by their node names in the file. */
export interface ShipModelParts {
  readonly hull: string;
  readonly sails: string;
  readonly flag: string;
}

/** A class's generated model and its real dimensions, as the generator states them. */
export interface ShipModel {
  /** The file under `public/ships/`. */
  readonly file: string;
  /** Length overall in metres: the hull only, without the bowsprit. */
  readonly lengthMetres: number;
  /** The hull's greatest breadth in metres. */
  readonly beamMetres: number;
  /** The hull's depth in metres, keel to sheer. */
  readonly depthMetres: number;
  /** How high the rig's top stands above the waterline, in metres: the hover box reaches it (ADR 0006). */
  readonly mastheadMetres: number;
  readonly parts: ShipModelParts;
  /**
   * The parts that take the owner's colour, by node name (#134). Named by
   * part, not by material: the Frigate's flag and sail patches share the
   * sails' canvas. Each is merged apart from the rest (#136).
   */
  readonly tintedParts: readonly string[];
}

/** The parts every class's generator names for the owner's colour (#134, #163): each its own node and material. */
const OWNER_PARTS: readonly string[] = ["Sails", "Pennant", "Hull_Stripe"];

const SLOOP: ShipModel = {
  file: "sloop.glb",
  lengthMetres: 18,
  beamMetres: 5.6,
  depthMetres: 4.15,
  mastheadMetres: 18.9,
  parts: { hull: "Hull", sails: "Sails", flag: "Jolly_Roger" },
  tintedParts: OWNER_PARTS,
};

const FLUTE: ShipModel = {
  file: "flute.glb",
  lengthMetres: 30,
  beamMetres: 7.4,
  depthMetres: 7.2,
  mastheadMetres: 25.8,
  parts: { hull: "Hull", sails: "Sails", flag: "Jolly_Roger" },
  tintedParts: OWNER_PARTS,
};

const FRIGATE: ShipModel = {
  file: "frigate.glb",
  lengthMetres: 38,
  beamMetres: 10.2,
  depthMetres: 8.4,
  mastheadMetres: 36,
  parts: { hull: "Hull", sails: "Sails", flag: "Jolly_Roger" },
  // Whether the sail patches take the colour too is #134's call.
  tintedParts: OWNER_PARTS,
};

const GALLEON: ShipModel = {
  file: "galleon.glb",
  lengthMetres: 42,
  beamMetres: 13.6,
  depthMetres: 11.1,
  mastheadMetres: 39.1,
  parts: { hull: "Hull", sails: "Sails", flag: "Jolly_Roger" },
  tintedParts: OWNER_PARTS,
};

/** Every class's model, or `null` for a class still drawn as a box. */
export const SHIP_MODELS: Readonly<Record<ShipClass, ShipModel | null>> = {
  Sloop: SLOOP,
  Flute: FLUTE,
  Frigate: FRIGATE,
  Galleon: GALLEON,
};

/** The model a ship of `shipClass` is drawn with, or `null` for the box. */
export const shipModel = (shipClass: ShipClass | undefined): ShipModel | null =>
  shipClass ? SHIP_MODELS[shipClass] : null;

/** The uniform scale that turns a model's metres into world units at ship scale (ADR 0006). */
export const shipModelScale = (): number => metresToUnits(1) * SHIP_SCALE;

/** The turn about +Y that points the model's bow (glTF −Z) along the board's heading (+Z, `atan2(dx, dz)` in `Ship`). */
export const SHIP_MODEL_ROTATION_Y = Math.PI;

/** The URL a model is served from, under the app's base path (Vite's `BASE_URL`, with its trailing slash). */
export const shipModelUrl = (model: ShipModel, base: string): string => `${base}ships/${model.file}`;
