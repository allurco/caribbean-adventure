import type { CaribbeanSetupData } from "../game/types";
import type { MapSizeId } from "../game/mapConfig";
import { isValidMapSeed } from "../game/mapSeed";

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
  /** `?view=sound`: the sound lab (#73). */
  soundLab?: true;
  /** `?view=combatlab`: the combat animation lab (prototype, PRD #259). */
  combatLab?: true;
  /** `?buoys=1`: buoys on the CPU sea surface around the camera focus, to check it rides the drawn water (#141). */
  seaBuoys?: true;
  /** `?stats=1`: a corner readout of fps, draw calls and triangles (#162), in dev builds only. */
  renderStats?: true;
  /** `?seedGallery=1`: the 12-seed contact sheet instead of the game (#161), in dev builds only. */
  seedGallery?: true;
  /** `?snapshot=1`: one gallery shot (#161): the draft picks itself and the board posts its picture to the gallery, in dev builds only. */
  gallerySnapshot?: true;
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
  if (params.get("view") === "sound") out.soundLab = true;
  if (params.get("view") === "combatlab") out.combatLab = true;
  if (params.get("buoys") === "1") out.seaBuoys = true;
  if (params.get("stats") === "1") out.renderStats = true;
  // Dev-only routes (#161): the DEV guard drops even their names from production builds.
  if (import.meta.env.DEV) {
    if (params.get("seedGallery") === "1") out.seedGallery = true;
    if (params.get("snapshot") === "1") out.gallerySnapshot = true;
  }

  return out;
}

function parseSetupData(size: string | null, seed: string | null): CaribbeanSetupData | undefined {
  const setupData: CaribbeanSetupData = {};
  if (size !== null && (MAP_SIZES as readonly string[]).includes(size)) setupData.mapSize = size as MapSizeId;
  const mapSeed = mapSeedFrom(seed);
  if (mapSeed !== undefined) setupData.mapSeed = mapSeed;
  return Object.keys(setupData).length > 0 ? setupData : undefined;
}

/** A finite number, or undefined for anything else (absent, empty, NaN, Infinity). */
function finiteNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** A plain decimal integer, or undefined. Not `Number()`'s reading: no hex, no exponent, no sign other than a leading minus. */
function integer(value: string | null): number | undefined {
  if (value === null || !/^-?\d+$/.test(value)) return undefined;
  return Number(value);
}

/**
 * A plain decimal integer that is also a valid map seed (within int32, the
 * rule `setup()` applies too), so the seed means exactly the map it names
 * and never aliases to another's.
 */
function mapSeedFrom(value: string | null): number | undefined {
  const n = integer(value);
  return isValidMapSeed(n) ? n : undefined;
}
