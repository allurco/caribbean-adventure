import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import { SOUNDS } from "../audio/soundRegistry";
import { SHIP_MODELS } from "./shipModels";
import { eventCardArtUrls } from "./cardArtSlots";
import { ASSET_LOADER_SITES, NOT_BOARD_ASSETS, SCENE_FONTS, sceneAssetUrls, sceneReadinessTasks } from "./sceneAssets";

/** Every file under public/ (the keys only; nothing is imported), as served paths. */
const PUBLIC_FILES = Object.keys(import.meta.glob("../../public/**/*")).map((path) => path.replace("../../public/", ""));

/** Every app source file (tests and the dev labs aside), by path under src/. */
const SOURCES = Object.entries(
  import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}", "!/src/lab/**", "!/src/**/*.d.ts"], { query: "?raw", import: "default", eager: true })
).map(([path, text]) => ({ path: path.slice(1), text }));

/** A call that fetches a file at run time. */
const LOADER = /\b(useGLTF|useGLTF\.preload|useTexture|useLoader|preloadFont|fetch)\(|\bnew (\w*Loader|Image)\(/;

describe("scene assets", () => {
  it("registers every file under public/ with the readiness gate, or says why the board never loads it", () => {
    const registered = sceneAssetUrls("/").map((url) => url.slice(1));
    const unregistered = PUBLIC_FILES.filter((file) => !registered.includes(file) && !(file in NOT_BOARD_ASSETS));
    expect(unregistered).toEqual([]);
  });

  it("only exempts files that exist", () => {
    for (const file of Object.keys(NOT_BOARD_ASSETS)) expect(PUBLIC_FILES).toContain(file);
  });

  it("waits on every ship model and every sound", () => {
    const urls = sceneAssetUrls("/");
    for (const model of Object.values(SHIP_MODELS)) if (model) expect(urls).toContain(`/ships/${model.file}`);
    for (const sound of SOUNDS) expect(urls).toContain(`/sounds/${sound.file}`);
  });

  it("knows every place in the app that loads a file, so a new loader cannot skip the gate", () => {
    const sites = SOURCES.filter(({ text }) => LOADER.test(text)).map(({ path }) => path).sort();
    expect(sites).toEqual([...Object.keys(ASSET_LOADER_SITES)].sort());
  });

  it("waits on every event card's art (#247), so a card never shows before its picture", () => {
    const urls = sceneAssetUrls("/");
    const ids = sceneReadinessTasks("/").map((task) => task.id);
    for (const url of eventCardArtUrls("/")) {
      expect(urls).toContain(url);
      expect(ids).toContain(`card:${url}`);
    }
    for (const task of sceneReadinessTasks("/").filter((t) => t.id.startsWith("card:"))) expect(task.stage).toBe("cards");
  });

  it("waits on every web font the page links", () => {
    const link = indexHtml.match(/fonts\.googleapis\.com\/css2\?([^"]+)"/);
    expect(link).not.toBeNull();
    const linked = [...(link?.[1] ?? "").matchAll(/family=([^:&]+):wght@([\d;]+)/g)].flatMap(([, family, weights]) =>
      weights.split(";").map((weight) => `${weight} ${family.replace(/\+/g, " ")}`)
    );
    expect(linked.length).toBeGreaterThan(0);
    expect([...SCENE_FONTS].sort()).toEqual(linked.sort());
  });

  it("makes one task per asset, font and label font, plus the world and the sky", () => {
    const tasks = sceneReadinessTasks("/");
    const ids = tasks.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const model of Object.values(SHIP_MODELS)) if (model) expect(ids).toContain(`model:/ships/${model.file}`);
    for (const sound of SOUNDS) expect(ids).toContain(`sound:${sound.id}`);
    for (const font of SCENE_FONTS) expect(ids).toContain(`font:${font}`);
    expect(ids).toContain("font:labels");
    expect(tasks.find((task) => task.id === "world")?.stage).toBe("world");
    expect(tasks.find((task) => task.id === "sky")?.stage).toBe("sky");
  });
});
