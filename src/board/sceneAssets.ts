/**
 * Everything the board waits on before it is shown (sceneReadiness.ts): the
 * ship models, the sounds, the event cards' art, the web fonts, the port labels' font, the built
 * world and the baked sky. sceneAssets.test.ts holds this list to the files
 * under public/, to the fonts index.html links and to every place in the app
 * that loads a file, so a new asset cannot skip the loading screen.
 */
import { SOUNDS, soundUrl } from "../audio/soundRegistry";
import type { ReadinessTask } from "./sceneReadiness";
import { SHIP_MODELS, shipModelUrl } from "./shipModels";
import { eventCardArtUrls } from "./cardArtSlots";

/** The web fonts the HUD uses, as `document.fonts.load` takes them ("weight family"); the ones index.html links. */
export const SCENE_FONTS: readonly string[] = [
  "500 Cinzel",
  "700 Cinzel",
  "400 Inter",
  "500 Inter",
  "600 Inter",
  "700 Inter",
];

/** Files under public/ the board never loads, and why. */
export const NOT_BOARD_ASSETS: Readonly<Record<string, string>> = {
  "manifest.webmanifest": "the web manifest (#123), read by the browser when the page is installed",
  "favicon-48.png": "the page's favicon (#123), the same art as the app icons, loaded by the browser",
  "icon-192.png": "the web manifest's 192 px icon (#123), read by the browser when the page is installed",
  "icon-512.png": "the web manifest's 512 px icon, any and maskable (#123), read by the browser when the page is installed",
  "apple-touch-icon.png": "the home-screen icon iOS reads from index.html (#123), never the board",
  "harbour/harbour-still.webp": "the online shell's harbour still (#122), a CSS background behind the shell, never the board",
  "waternormals.jpg": "not loaded anywhere: the sea's normals come from the wave cascades",
};

/**
 * Every source file that loads a file at run time, and how what it loads
 * reaches the readiness gate. A new loader must be added here (and its
 * assets to the gate) or sceneAssets.test.ts fails.
 */
export const ASSET_LOADER_SITES: Readonly<Record<string, string>> = {
  "src/board/Ship.tsx": "ship models: every model in SHIP_MODELS is a `model:` task, loaded by SceneReadinessProbe",
  "src/board/SceneReadinessProbe.tsx": "loads the ship models through the same useGLTF cache Ship.tsx draws from",
  "src/board/useSceneReadiness.ts":
    "the port labels' font (troika preloadFont), a `font:labels` task; and every event card's art (`new Image`), a `card:` task each (#247)",
  "src/audio/audioEngine.ts": "sounds: every registry sound is a `sound:` task, prefetched by useSceneReadiness",
  "src/online/roomApi.ts": "no file: calls to /api from the online pages (#112), never the board",
  "src/online/useRoomApi.ts": "no file: the browser fetch the /api clients use (#112), never the board",
};

/** The URL of every file the board waits on, under the app's base path. */
export function sceneAssetUrls(base: string): string[] {
  const models = Object.values(SHIP_MODELS).flatMap((model) => (model ? [shipModelUrl(model, base)] : []));
  return [...new Set(models), ...SOUNDS.map((sound) => soundUrl(sound, base)), ...eventCardArtUrls(base)];
}

/** The ship model URLs the board waits on. */
export function sceneModelUrls(base: string): string[] {
  return [...new Set(Object.values(SHIP_MODELS).flatMap((model) => (model ? [shipModelUrl(model, base)] : [])))];
}

/** The readiness tasks, in loading-screen order. */
export function sceneReadinessTasks(base: string): ReadinessTask[] {
  return [
    ...sceneModelUrls(base).map((url): ReadinessTask => ({ id: `model:${url}`, stage: "models" })),
    ...SCENE_FONTS.map((font): ReadinessTask => ({ id: `font:${font}`, stage: "fonts" })),
    { id: "font:labels", stage: "fonts" },
    ...SOUNDS.map((sound): ReadinessTask => ({ id: `sound:${sound.id}`, stage: "sounds" })),
    ...eventCardArtUrls(base).map((url): ReadinessTask => ({ id: `card:${url}`, stage: "cards" })),
    { id: "world", stage: "world" },
    { id: "sky", stage: "sky" },
  ];
}
