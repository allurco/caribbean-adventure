import { describe, it, expect } from "vitest";
import {
  SEED_GALLERY_SEEDS,
  SEED_GALLERY_VIEWS,
  galleryShots,
  galleryShotView,
  galleryShotUrl,
  isSeedGalleryMessage,
} from "./seedGalleryShots";
import { generateMapFor } from "../game/mapRequest";
import { computeCameraConfig, getMapPreset } from "../game/mapConfig";
import { hexToWorld } from "../game/hex";
import { SHIP_VIEW_DISTANCE, SHIP_VIEW_OFFSET_X } from "../board/shipView";
import { isValidMapSeed } from "../game/mapSeed";
import { parseDevUrlParams } from "../board/devUrlParams";
import type { MapCell } from "../game/types";

describe("the seed gallery's seeds and views", () => {
  it("lists 12 distinct valid seeds and the two views, map and port", () => {
    expect(SEED_GALLERY_SEEDS).toHaveLength(12);
    expect(new Set(SEED_GALLERY_SEEDS).size).toBe(12);
    for (const seed of SEED_GALLERY_SEEDS) expect(isValidMapSeed(seed)).toBe(true);
    expect(SEED_GALLERY_VIEWS.map((v) => v.id)).toEqual(["map", "port"]);
  });

  it("starts on small seed 1, the PRD's reference map", () => {
    expect(SEED_GALLERY_SEEDS[0]).toBe(1);
  });

  it("shoots every seed in every view, seed by seed: 12 × 2", () => {
    const shots = galleryShots("small");
    expect(shots).toHaveLength(SEED_GALLERY_SEEDS.length * SEED_GALLERY_VIEWS.length);
    expect(shots.slice(0, 2)).toEqual([
      { mapSize: "small", mapSeed: SEED_GALLERY_SEEDS[0], view: "map" },
      { mapSize: "small", mapSeed: SEED_GALLERY_SEEDS[0], view: "port" },
    ]);
    expect(galleryShots("large").every((s) => s.mapSize === "large")).toBe(true);
  });
});

describe("galleryShotView", () => {
  const cells = generateMapFor({ mapSize: "small", mapSeed: 1 });
  const camera = computeCameraConfig(getMapPreset("small"));

  it("frames the whole map from its iso distance in the map view", () => {
    expect(galleryShotView("map", "small", cells)).toEqual({ target: camera.target, distance: camera.isoDistance });
  });

  it("frames the port nearest the map's middle at ship zoom in the port view, as the opening view frames a ship", () => {
    const ports = cells.filter((c) => c.hasPort);
    const distanceToMiddle = (c: MapCell) => {
      const [x, , z] = hexToWorld(c.hex);
      return Math.hypot(x - camera.target[0], z - camera.target[2]);
    };
    const nearest = Math.min(...ports.map(distanceToMiddle));
    const view = galleryShotView("port", "small", cells);
    expect(view.distance).toBe(SHIP_VIEW_DISTANCE);
    const port = ports.find((c) => {
      const [x, , z] = hexToWorld(c.hex);
      return view.target[0] === x + SHIP_VIEW_OFFSET_X && view.target[2] === z;
    });
    expect(port).toBeDefined();
    expect(distanceToMiddle(port!)).toBe(nearest);
  });

  it("falls back to the map view on a map with no port", () => {
    const noPorts = cells.map((c) => ({ ...c, hasPort: false }));
    expect(galleryShotView("port", "small", noPorts)).toEqual(galleryShotView("map", "small", cells));
  });

  it("is the same for the same seed and differs between seeds (S1, S2)", () => {
    expect(galleryShotView("port", "small", generateMapFor({ mapSize: "small", mapSeed: 1 }))).toEqual(galleryShotView("port", "small", cells));
    const targets = new Set(
      SEED_GALLERY_SEEDS.map((mapSeed) => galleryShotView("port", "small", generateMapFor({ mapSize: "small", mapSeed })).target.join(",")),
    );
    expect(targets.size).toBeGreaterThan(1);
  });
});

describe("galleryShotUrl", () => {
  it("reproduces the shot through the dev URL parser, in snapshot mode", () => {
    const url = galleryShotUrl("http://localhost:5173/?seedGallery=1", { mapSize: "medium", mapSeed: 7, view: "port" }, { target: [12.3456, 0, 13.9], distance: 3.4 });
    const parsed = parseDevUrlParams(new URL(url).search);
    expect(parsed.setupData).toEqual({ mapSize: "medium", mapSeed: 7 });
    expect(parsed.cameraTarget).toEqual([12.346, 0, 13.9]);
    expect(parsed.cameraDistance).toBe(3.4);
    expect(parsed.gallerySnapshot).toBe(true);
    expect(parsed.seedGallery).toBeUndefined();
  });

  it("leaves snapshot mode out of the URL to open by hand", () => {
    const shot = { mapSize: "small" as const, mapSeed: 1, view: "map" as const };
    const url = galleryShotUrl("http://localhost:5173/", shot, { target: [1, 0, 2], distance: 20 }, false);
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ size: "small", seed: "1", cx: "1", cz: "2", dist: "20" });
  });
});

describe("isSeedGalleryMessage", () => {
  it("accepts a shot's picture and nothing else", () => {
    expect(isSeedGalleryMessage({ type: "seed-gallery-shot", image: "data:image/jpeg;base64,AAAA" })).toBe(true);
    expect(isSeedGalleryMessage({ type: "seed-gallery-shot", image: "https://example.com/x.png" })).toBe(false);
    expect(isSeedGalleryMessage({ type: "other", image: "data:image/png;base64,AAAA" })).toBe(false);
    expect(isSeedGalleryMessage(null)).toBe(false);
    expect(isSeedGalleryMessage("seed-gallery-shot")).toBe(false);
  });
});
