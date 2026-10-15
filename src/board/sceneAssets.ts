/**
 * Everything the board waits on before it is shown (sceneReadiness.ts): the
 * ship models, the sounds, the web fonts, the port labels' font, the built
 * world and the baked sky. sceneAssets.test.ts holds this list to the files
 * under public/, to the fonts index.html links and to every place in the app
 * that loads a file, so a new asset cannot skip the loading screen.
 */
import { SOUNDS, soundUrl } from "../audio/soundRegistry";
import type { ReadinessTask } from "./sceneReadiness";
import { SHIP_MODELS, shipModelUrl } from "./shipModels";

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
  "vite.svg": "the page's favicon, loaded by the browser",
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
  "src/board/useSceneReadiness.ts": "the port labels' font (troika preloadFont), a `font:labels` task",
  "src/audio/audioEngine.ts": "sounds: every registry sound is a `sound:` task, prefetched by useSceneReadiness",
  "src/online/roomApi.ts": "no file: calls to /api from the online pages (#112), never the board",
  "src/online/useRoomApi.ts": "no file: the browser fetch the /api clients use (#112), never the board",
};

/** The URL of every file the board waits on, under the app's base path. */
export function sceneAssetUrls(base: string): string[] {
  const models = Object.values(SHIP_MODELS).flatMap((model) => (model ? [shipModelUrl(model, base)] : []));
  return [...new Set(models), ...SOUNDS.map((sound) => soundUrl(sound, base))];
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
    { id: "world", stage: "world" },
    { id: "sky", stage: "sky" },
  ];
}
