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
  readonly parts: ShipModelParts;
}

const SLOOP: ShipModel = {
  file: "sloop.glb",
  lengthMetres: 18,
  beamMetres: 5.6,
  depthMetres: 4.15,
  parts: { hull: "Hull", sails: "Sails", flag: "Jolly_Roger" },
};

const FLUTE: ShipModel = {
  file: "flute.glb",
  lengthMetres: 30,
  beamMetres: 7.4,
  depthMetres: 7.2,
  parts: { hull: "Hull", sails: "Sails", flag: "Jolly_Roger" },
};

const FRIGATE: ShipModel = {
  file: "frigate.glb",
  lengthMetres: 38,
  beamMetres: 10.2,
  depthMetres: 8.4,
  parts: { hull: "Hull", sails: "Sails", flag: "Jolly_Roger" },
};

const GALLEON: ShipModel = {
  file: "galleon.glb",
  lengthMetres: 34,
  beamMetres: 11,
  depthMetres: 10.1,
  parts: { hull: "Hull", sails: "Sails", flag: "Jolly_Roger" },
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

/** The uniform scale that turns a model's metres into world units at ship scale (ADR 0003). */
export const shipModelScale = (): number => metresToUnits(1) * SHIP_SCALE;

/** The turn about +Y that points the model's bow (glTF −Z) along the board's heading (+Z, `atan2(dx, dz)` in `Ship`). */
export const SHIP_MODEL_ROTATION_Y = Math.PI;

/** The URL a model is served from, under the app's base path (Vite's `BASE_URL`, with its trailing slash). */
export const shipModelUrl = (model: ShipModel, base: string): string => `${base}ships/${model.file}`;
