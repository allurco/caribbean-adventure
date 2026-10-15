import type { CaribbeanSetupData } from "../game/types";
import type { MapSizeId } from "../game/mapConfig";
import { isValidMapSeed } from "../game/mapSeed";
import { DEFAULT_SEATS, isValidSeatCount } from "../game/seats";
import { REGION_BORDER_MODES, type RegionBorderMode } from "./regionBorderMode";

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
  /** `?buoys=1`: buoys on the CPU sea surface around the camera focus, to check it rides the drawn water (#141). */
  seaBuoys?: true;
  /** `?regionBorder=water|line`: the region borders as a soft seam in the water or as the old line (#239); the default is `DEFAULT_REGION_BORDER_MODE`. */
  regionBorder?: RegionBorderMode;
  /** `?stats=1`: a corner readout of fps, draw calls and triangles (#162), in dev builds only. */
  renderStats?: true;
  /** `?seedGallery=1`: the 12-seed contact sheet instead of the game (#161), in dev builds only. */
  seedGallery?: true;
  /** `?snapshot=1`: one gallery shot (#161): the draft picks itself and the board posts its picture to the gallery, in dev builds only. */
  gallerySnapshot?: true;
  /** `?seats=1`: every seat of the match on one page, through boardgame.io's local transport, one seat shown at a time (#110), in dev builds only. */
  localSeats?: true;
  /** `?fx=0`, `?ink=0`, `?bloom=0`, `?post=0`, `?shadows=0`, `?aa=0`, `?ocean=0`, `?land=0`: parts of the picture left out, to tell on a real GPU which one a rendering fault comes from; read in production builds too. */
  renderOff?: RenderOff;
  /** `?dpr=1`, `?power=low`, `?pdb=1`, `?gpuinfo=1`: how the GL context is set up, and a readout of what it got, for the same checks; read in production builds too. */
  gpu?: GpuCheck;
  /** `?players=1..4`: the match's seats, a hotseat game for testing (#278), in dev builds only; solo without it (`seatCount`). */
  players?: number;
}

/** Parts of the picture left out (`?fx=0`, `?ink=0`, `?bloom=0`, `?post=0`, `?shadows=0`, `?aa=0`, `?ocean=0`, `?land=0`). */
export interface RenderOff {
  combatFx?: true;
  regionInk?: true;
  bloom?: true;
  /** `?post=0`: no post-processing at all; the scene is drawn straight to the screen. */
  postProcessing?: true;
  /** `?shadows=0`: no shadow maps. */
  shadows?: true;
  /** `?aa=0`: no multisampling, on the canvas or in the composer. */
  msaa?: true;
  /** `?ocean=0`: no sea surface. */
  ocean?: true;
  /** `?land=0`: no land mesh and none of its decorations. */
  land?: true;
}

/** How the GL context is set up for a check on a real GPU (`?dpr=1`, `?power=low`, `?pdb=1`), and `?gpuinfo=1`. */
export interface GpuCheck {
  /** `?dpr=1`: the canvas at pixel ratio 1. */
  dpr1?: true;
  /** `?power=low`: `powerPreference: "low-power"`. */
  lowPower?: true;
  /** `?pdb=1`: `preserveDrawingBuffer: true`. */
  preserveDrawingBuffer?: true;
  /** `?gpuinfo=1`: an on-screen readout of the GL context and its frame (GpuInfoOverlay). */
  info?: true;
}

/** Each `RenderOff` switch: its URL parameter, set to `0`. */
const RENDER_OFF_SWITCHES: readonly (readonly [string, keyof RenderOff])[] = [
  ["fx", "combatFx"],
  ["ink", "regionInk"],
  ["bloom", "bloom"],
  ["post", "postProcessing"],
  ["shadows", "shadows"],
  ["aa", "msaa"],
  ["ocean", "ocean"],
  ["land", "land"],
];
/** Each `GpuCheck` switch: its URL parameter and the value that turns it on. */
const GPU_SWITCHES: readonly (readonly [string, string, keyof GpuCheck])[] = [
  ["dpr", "1", "dpr1"],
  ["power", "low", "lowPower"],
  ["pdb", "1", "preserveDrawingBuffer"],
  ["gpuinfo", "1", "info"],
];

/**
 * The A/B switches in effect, as the URL spells them (`fx=0`, `pdb=1`, …):
 * what `?gpuinfo=1` shows instead of the whole query, which may carry
 * other things.
 */
export function renderSwitches(off: RenderOff, gpu: GpuCheck): string[] {
  return [
    ...RENDER_OFF_SWITCHES.filter(([, key]) => off[key]).map(([name]) => `${name}=0`),
    ...GPU_SWITCHES.filter(([, , key]) => gpu[key]).map(([name, value]) => `${name}=${value}`),
  ];
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
  if (params.get("buoys") === "1") out.seaBuoys = true;
  if (params.get("stats") === "1") out.renderStats = true;
  const regionBorder = params.get("regionBorder");
  const mode = REGION_BORDER_MODES.find((m) => m === regionBorder);
  if (mode) out.regionBorder = mode;
  const renderOff: RenderOff = {};
  for (const [name, key] of RENDER_OFF_SWITCHES) if (params.get(name) === "0") renderOff[key] = true;
  if (Object.keys(renderOff).length > 0) out.renderOff = renderOff;
  const gpu: GpuCheck = {};
  for (const [name, value, key] of GPU_SWITCHES) if (params.get(name) === value) gpu[key] = true;
  if (Object.keys(gpu).length > 0) out.gpu = gpu;
  // Dev-only routes (#161): the DEV guard drops even their names from production builds.
  if (import.meta.env.DEV) {
    if (params.get("seedGallery") === "1") out.seedGallery = true;
    if (params.get("snapshot") === "1") out.gallerySnapshot = true;
    if (params.get("seats") === "1") out.localSeats = true;
    const players = integer(params.get("players"));
    if (players !== undefined && isValidSeatCount(players)) out.players = players;
  }

  return out;
}

/**
 * How many seats the local match has (#278): `?players=`, else solo. The
 * seats on one page (`?seats=1`) use the same count.
 */
export function seatCount(params: DevUrlParams): number {
  return params.players ?? DEFAULT_SEATS;
}

/**
 * Whether the game client shows boardgame.io's debug panel, the one place
 * that decides: not in a gallery shot, where it would cover the right of the
 * picture, nor for the seats on one page, where even folded its tab covers
 * End Turn and the turn bar (#110; the seat switcher plays every seat).
 */
export function showsDebugPanel(params: DevUrlParams): boolean {
  return params.gallerySnapshot !== true && params.localSeats !== true;
}

/**
 * Whether the local game reads and writes its save (#300): only when the URL
 * pins nothing about the match. A URL that pins a map size or seed or a seat
 * count (`?size=`, `?seed=`, `?players=`), or is the seats on one page or a
 * gallery shot, starts that exact match every time: it neither offers to
 * continue an unrelated saved voyage nor overwrites it. Camera, render and
 * GPU switches change only the picture, so they keep the save.
 */
export function usesHotseatSave(params: DevUrlParams): boolean {
  return params.setupData === undefined && params.players === undefined && params.localSeats !== true && params.gallerySnapshot !== true && params.seedGallery !== true;
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
