import { useEffect, useMemo, useRef, useState } from "react";
import type { MapSizeId } from "../game/mapConfig";
import { generateMapFor } from "../game/mapRequest";
import {
  SEED_GALLERY_DEFAULT_SIZE,
  SEED_GALLERY_SEEDS,
  SEED_GALLERY_SHOT_HEIGHT,
  SEED_GALLERY_SHOT_WIDTH,
  SEED_GALLERY_VIEWS,
  galleryShotUrl,
  galleryShotView,
  galleryShots,
  isSeedGalleryMessage,
} from "./seedGalleryShots";

/** How long one shot may take before the gallery gives up on it and moves on. */
const SHOT_TIMEOUT_MS = 60000;

type ShotResult = { image: string } | { failed: true };

/**
 * The 12-seed contact sheet (#161, `?seedGallery=1`, dev only): every seed of
 * `SEED_GALLERY_SEEDS` in every view of `SEED_GALLERY_VIEWS`, one row a seed.
 * The shots load one at a time in a frame (one WebGL context at a time), each
 * a plain game URL in snapshot mode that posts its picture back; each picture
 * links to its URL, and the sheet saves as one PNG.
 */
export default function SeedGallery({ mapSize = SEED_GALLERY_DEFAULT_SIZE }: { mapSize?: MapSizeId }) {
  const shots = useMemo(() => {
    const cellsBySeed = new Map(SEED_GALLERY_SEEDS.map((mapSeed) => [mapSeed, generateMapFor({ mapSize, mapSeed })]));
    return galleryShots(mapSize).map((shot) => {
      const view = galleryShotView(shot.view, mapSize, cellsBySeed.get(shot.mapSeed) ?? []);
      return {
        ...shot,
        url: galleryShotUrl(window.location.href, shot, view),
        viewUrl: galleryShotUrl(window.location.href, shot, view, false),
      };
    });
  }, [mapSize]);
  const [results, setResults] = useState<ShotResult[]>([]);
  const current = results.length < shots.length ? results.length : null;
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (current === null) return;
    const settle = (result: ShotResult) => setResults((prev) => (prev.length === current ? [...prev, result] : prev));
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (isSeedGalleryMessage(event.data)) settle({ image: event.data.image });
    };
    window.addEventListener("message", onMessage);
    const timer = window.setTimeout(() => settle({ failed: true }), SHOT_TIMEOUT_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
  }, [current]);

  const done = current === null;

  return (
    <div data-testid="seed-gallery" className="h-screen overflow-auto bg-[#0a1929] text-white font-mono p-4">
      <div className="flex items-baseline gap-4 mb-3">
        <h1 className="text-lg">Seed gallery · {mapSize}</h1>
        <span className="text-sm text-white/70">
          {done ? `${shots.length} shots` : `rendering ${results.length + 1} / ${shots.length}`}
        </span>
        {done && (
          <button type="button" className="text-sm px-2 rounded bg-white/15 hover:bg-white/30" onClick={() => saveSheet(mapSize, results)}>
            save PNG
          </button>
        )}
      </div>

      <table className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="text-left text-sm font-normal text-white/70">seed</th>
            {SEED_GALLERY_VIEWS.map((v) => (
              <th key={v.id} className="text-left text-sm font-normal text-white/70">
                {v.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SEED_GALLERY_SEEDS.map((seed, row) => (
            <tr key={seed}>
              <td className="align-top pr-2 text-sm">{seed}</td>
              {SEED_GALLERY_VIEWS.map((v, col) => {
                const index = row * SEED_GALLERY_VIEWS.length + col;
                const result = results[index];
                return (
                  <td key={v.id} style={{ width: SEED_GALLERY_SHOT_WIDTH / 2, height: SEED_GALLERY_SHOT_HEIGHT / 2 }} className="bg-black/40 p-0">
                    {result && "image" in result ? (
                      <a href={shots[index].viewUrl} target="_blank" rel="noreferrer">
                        <img src={result.image} alt={`seed ${seed}, ${v.label}`} className="block w-full h-full object-cover" />
                      </a>
                    ) : (
                      <span className="block p-2 text-xs text-white/50">{result ? "failed" : index === current ? "rendering…" : "queued"}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {current !== null && (
        <iframe
          ref={frame}
          key={current}
          title="seed gallery shot"
          src={shots[current].url}
          width={SEED_GALLERY_SHOT_WIDTH}
          height={SEED_GALLERY_SHOT_HEIGHT}
          className="fixed right-4 bottom-4 border border-white/30"
        />
      )}
    </div>
  );
}

/** The sheet as one PNG: a row a seed, a column a view, the seed written on each row. */
function saveSheet(mapSize: MapSizeId, results: ShotResult[]) {
  const label = 80;
  const w = SEED_GALLERY_SHOT_WIDTH;
  const h = SEED_GALLERY_SHOT_HEIGHT;
  const cols = SEED_GALLERY_VIEWS.length;
  const canvas = document.createElement("canvas");
  canvas.width = label + cols * w;
  canvas.height = SEED_GALLERY_SEEDS.length * h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#0a1929";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "20px monospace";
  const loads = results.map((result, index) => {
    if (!("image" in result)) return Promise.resolve();
    const img = new Image();
    img.src = result.image;
    return img.decode().then(() => ctx.drawImage(img, label + (index % cols) * w, Math.floor(index / cols) * h, w, h));
  });
  SEED_GALLERY_SEEDS.forEach((seed, row) => ctx.fillText(String(seed), 8, row * h + 28));
  Promise.all(loads).then(() => {
    const link = document.createElement("a");
    link.download = `seed-gallery-${mapSize}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}
