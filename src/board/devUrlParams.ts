import type { CaribbeanSetupData } from "../game/types";
import type { MapSizeId } from "../game/mapConfig";

/**
 * Dev-only URL parameters (#74), so a URL alone reproduces a map and a view
 * for screenshots. Every field is absent unless its parameters are present
 * and valid, and an absent field changes nothing. Documented in the README
 * under "Dev URL parameters".
 */
export interface DevUrlParams {
  /** `?size=small|medium|large&seed=<int32>`: the map to generate. */
  setupData?: CaribbeanSetupData;
  /** `?cx=&cz=`: where the camera looks at first (both needed). */
  cameraTarget?: [number, number, number];
  /** `?dist=`: how far from its target the camera starts (positive). */
  cameraDistance?: number;
  /** `?view=props`, with `&focus=n` to start close up on entry n. */
  propViewer?: { focus?: number };
  /** `?massifs=1`: the #83 prototype's rock massifs in the terrain field. */
  massifs?: boolean;
  /** `?houses=1`: the #83 prototype's tiny-house scale boxes on every port hex. */
  houseBoxes?: boolean;
  /**
   * `?hexMetres=<positive>`: the #84 experiment's hex scale. Every authored
   * prop and ship is drawn at 115 / hexMetres (`propScale.ts`, which reads
   * this at module load so module-level sizes pick it up).
   */
  hexMetres?: number;
  /** `&scaleWater=1`: the #84 experiment's water follows the hex scale (`worldScale.ts`). */
  scaleWater?: boolean;
  /** `&minDist=<positive>`: the #84 experiment's zoom floor, in world units, instead of the map-fraction one. */
  minDistance?: number;
}

const MAP_SIZES: readonly MapSizeId[] = ["small", "medium", "large"];

/** The parameters in `search` (`window.location.search`, with its leading `?`). */
export function parseDevUrlParams(search: string): DevUrlParams {
  const params = new URLSearchParams(search);
  const out: DevUrlParams = {};

  const setupData = parseSetupData(params.get("size"), params.get("seed"));
  if (setupData) out.setupData = setupData;

  const cx = finiteNumber(params.get("cx"));
  const cz = finiteNumber(params.get("cz"));
  if (cx !== undefined && cz !== undefined) out.cameraTarget = [cx, 0, cz];

  const dist = finiteNumber(params.get("dist"));
  if (dist !== undefined && dist > 0) out.cameraDistance = dist;

  if (params.get("view") === "props") {
    const focus = integer(params.get("focus"));
    out.propViewer = focus !== undefined && focus >= 0 ? { focus } : {};
  }

  if (params.get("massifs") === "1") out.massifs = true;
  if (params.get("houses") === "1") out.houseBoxes = true;

  const hexMetres = finiteNumber(params.get("hexMetres"));
  if (hexMetres !== undefined && hexMetres > 0) out.hexMetres = hexMetres;
  if (params.get("scaleWater") === "1") out.scaleWater = true;
  const minDist = finiteNumber(params.get("minDist"));
  if (minDist !== undefined && minDist > 0) out.minDistance = minDist;

  return out;
}

function parseSetupData(size: string | null, seed: string | null): CaribbeanSetupData | undefined {
  const setupData: CaribbeanSetupData = {};
  if (size !== null && (MAP_SIZES as readonly string[]).includes(size)) setupData.mapSize = size as MapSizeId;
  const mapSeed = integer(seed);
  if (mapSeed !== undefined) setupData.mapSeed = mapSeed;
  return Object.keys(setupData).length > 0 ? setupData : undefined;
}

/** A finite number, or undefined for anything else (absent, empty, NaN, Infinity). */
function finiteNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * A plain decimal integer within int32, or undefined. Not `Number()`'s
 * reading: no hex, no exponent, no sign other than a leading minus, so
 * that a seed the map generator folds to int32 (`seed | 0`) means exactly
 * the map it names and never aliases to another's.
 */
function integer(value: string | null): number | undefined {
  if (value === null || !/^-?\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= -2147483648 && n <= 2147483647 ? n : undefined;
}
