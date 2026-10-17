/**
 * The town model catalogue (PRD #392, ADR 0002 amendment (d)): which port
 * pieces are drawn from a generated model in `public/town/`, and what the
 * board plans each one with. Pure, no Three.js; `PortBuildings.tsx` draws
 * them, and the town asset test (`townAssets.node.test.ts`) holds every file
 * to its entry.
 *
 * The generator's contract (`boats/town/`): real metres, the origin at the
 * ground contact under the plan centre, the front (the door) along glTF +Z,
 * no images, `COLOR_0` with the occlusion baked in, and the `_TINT` channel.
 */
import type { BuildingKind } from "./visuals/buildingGeometry";
import { AGED_BUILDING_TRIANGLES } from "./visuals/agedBuildingGeometry";
import { metresToUnits } from "./visuals/worldScale";

/** The pieces that have a model so far: the tavern, the kit's tracer bullet (#394). */
export type TownPieceKind = Extract<BuildingKind, "tavern">;

/** A piece's generated model and its real dimensions, as the generator states them. */
export interface TownModel {
  /** The building kind the layout places it as. */
  readonly kind: TownPieceKind;
  /** The file under `public/town/`. */
  readonly file: string;
  /** Half the walls' width across the front (glTF x), in metres: the footprint the layout plans with. */
  readonly halfWidthMetres: number;
  /** Half the walls' depth front to back (glTF z), in metres. */
  readonly halfDepthMetres: number;
  /** The top of the piece above its ground contact, in metres. */
  readonly heightMetres: number;
  /** How far its footing reaches under the ground contact, in metres: what covers the low side on a slope. */
  readonly footingMetres: number;
  /** The farthest any part reaches from the plan centre, in metres: the plan circle the layout keeps buildings apart by. */
  readonly reachMetres: number;
  /** The part whose plan bounds are the footprint. */
  readonly footprintPart: string;
  /** The triangles it may draw (PRD #392's piece table). */
  readonly maxTriangles: number;
  /** The triangles the code-built piece it replaces draws: the model may draw at most `TOWN_TRIANGLE_GROWTH` more (#394). */
  readonly codeBuiltTriangles: number;
  /** The anchors it carries, by node name: the chimney's smoke and the windows' light (amendment (b)). */
  readonly anchors: readonly string[];
}

/** Metres to the code-built pieces' local units at scale 1 (65 m a unit, ADR 0003); the layout's instance scale then adds the family factor. */
export const TOWN_MODEL_UNITS_PER_METRE = metresToUnits(1);

const TAVERN_WINDOWS = Array.from({ length: 11 }, (_, i) => `Window_${String(i).padStart(2, "0")}`);

const TAVERN: TownModel = {
  kind: "tavern",
  file: "tavern.glb",
  halfWidthMetres: 7.15,
  halfDepthMetres: 5.85,
  heightMetres: 18.07,
  footingMetres: 10.4,
  reachMetres: 12.675,
  footprintPart: "Walls",
  maxTriangles: 1800,
  codeBuiltTriangles: AGED_BUILDING_TRIANGLES.tavern,
  anchors: ["Chimney_00", ...TAVERN_WINDOWS],
};

/** Every piece's model. */
export const TOWN_MODELS: Readonly<Record<TownPieceKind, TownModel>> = { tavern: TAVERN };

/** The URL a model is served from, under the app's base path (Vite's `BASE_URL`, with its trailing slash). */
export const townModelUrl = (model: TownModel, base: string): string => `${base}town/${model.file}`;

/** The model a building kind is drawn from, or `null` while it is still code-built. */
export const townModelFor = (kind: BuildingKind): TownModel | null => (kind === "tavern" ? TOWN_MODELS[kind] : null);
