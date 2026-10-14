import type { MapCell } from "../game/types";
import type { MapSizeId } from "../game/mapConfig";
import type { MapRequest } from "../game/mapRequest";
import { computeCameraConfig, getMapPreset } from "../game/mapConfig";
import { hexToWorld } from "../game/hex";
import { SHIP_VIEW_DISTANCE, SHIP_VIEW_OFFSET_X } from "../board/shipView";
import type { CameraView } from "../board/shipView";

/**
 * The 12-seed contact sheet (#161, PRD #158 criterion S5): every visual slice
 * is approved on these seeds, in these views. The one place both are listed.
 * Small seed 1 is the PRD's reference map; the rest spread over small,
 * round and large values so neighbouring seeds are not all that is seen.
 */
export const SEED_GALLERY_SEEDS: readonly number[] = [1, 2, 3, 7, 13, 42, 99, 256, 1001, 4242, 31337, 123456];

export type SeedGalleryViewId = "map" | "port";

/** The two views of each seed: the whole map, and one port at the opening ship zoom. */
export const SEED_GALLERY_VIEWS: readonly { id: SeedGalleryViewId; label: string }[] = [
  { id: "map", label: "Map zoom" },
  { id: "port", label: "Port, ship zoom" },
];

/** The gallery's size when the URL names none. */
export const SEED_GALLERY_DEFAULT_SIZE: MapSizeId = "small";

/** How long a shot's board renders before it is taken, so ship models, textures and the sea settle. */
export const SEED_GALLERY_SETTLE_MS = 4000;

/** One picture on the sheet: a map and a view of it. */
export interface SeedGalleryShot extends MapRequest {
  view: SeedGalleryViewId;
}

/** Every shot of the sheet at `mapSize`, seed by seed, each seed in every view. */
export function galleryShots(mapSize: MapSizeId): SeedGalleryShot[] {
  return SEED_GALLERY_SEEDS.flatMap((mapSeed) => SEED_GALLERY_VIEWS.map(({ id }) => ({ mapSize, mapSeed, view: id })));
}

/**
 * Where the camera stands for `view` of the map `cells`: the map's middle at
 * its iso distance, or the port nearest that middle framed as the opening
 * view frames a ship (`SHIP_VIEW_DISTANCE`, offset by `SHIP_VIEW_OFFSET_X`).
 * A map with no port falls back to the map view. The first port in cell
 * order wins a tie, so the view is a pure function of the map.
 */
export function galleryShotView(view: SeedGalleryViewId, mapSize: MapSizeId, cells: readonly MapCell[]): CameraView {
  const camera = computeCameraConfig(getMapPreset(mapSize));
  const mapView: CameraView = { target: camera.target, distance: camera.isoDistance };
  if (view === "map") return mapView;

  let best: { x: number; y: number; z: number; d: number } | null = null;
  for (const cell of cells) {
    if (!cell.hasPort) continue;
    const [x, y, z] = hexToWorld(cell.hex);
    const d = Math.hypot(x - camera.target[0], z - camera.target[2]);
    if (!best || d < best.d) best = { x, y, z, d };
  }
  if (!best) return mapView;
  return { target: [best.x + SHIP_VIEW_OFFSET_X, best.y, best.z], distance: SHIP_VIEW_DISTANCE };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The URL of one shot, on `href`'s origin and path: the map pinned by size
 * and seed, the camera by `cx`/`cz`/`dist`; with `snapshot` (the gallery's
 * frame) also `snapshot=1`, so the board skips the draft and posts its
 * picture to the gallery. Without it, the same view to open by hand.
 */
export function galleryShotUrl(href: string, shot: SeedGalleryShot, view: CameraView, snapshot = true): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("size", shot.mapSize);
  url.searchParams.set("seed", String(shot.mapSeed));
  url.searchParams.set("cx", String(round(view.target[0])));
  url.searchParams.set("cz", String(round(view.target[2])));
  url.searchParams.set("dist", String(round(view.distance)));
  if (snapshot) url.searchParams.set("snapshot", "1");
  return url.toString();
}

/** A shot's size on screen, CSS pixels: the 1600 × 1000 reference frame at half size. */
export const SEED_GALLERY_SHOT_WIDTH = 800;
export const SEED_GALLERY_SHOT_HEIGHT = 500;

/** The message a shot's board posts to the gallery once its picture is taken. */
export interface SeedGalleryMessage {
  type: "seed-gallery-shot";
  /** The picture, as a data URL. */
  image: string;
}

/** Whether `data` (a `message` event's) is a gallery shot's picture. */
export function isSeedGalleryMessage(data: unknown): data is SeedGalleryMessage {
  if (typeof data !== "object" || data === null) return false;
  const { type, image } = data as Record<string, unknown>;
  return type === "seed-gallery-shot" && typeof image === "string" && image.startsWith("data:image/");
}
