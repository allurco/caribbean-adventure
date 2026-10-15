/**
 * One wind (#204): the sea, the palms, the reefs and the ships all take their
 * wind from `windFor(weather)`, through the scene's wind, and no module
 * defines a wind direction of its own. The wind lives in the game logic
 * (#264), so the rules (the weather gauge) read the same one; the board only
 * re-exports it. Read from the sources of both, since the rule is about who
 * defines what (like lightingSource.node.test.ts).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const SCANNED = ["board", "game"];

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The code without its comments, so prose that names a wind does not count as defining one. */
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SOURCES = new Map(
  SCANNED.flatMap((dir) => sourcesUnder(join(SRC_DIR, dir))).map((path) => [
    relative(SRC_DIR, path).split("\\").join("/"),
    stripComments(readFileSync(path, "utf8")),
  ])
);
const source = (file: string): string => {
  const text = SOURCES.get(file);
  if (text === undefined) throw new Error(`no source ${file}`);
  return text;
};
const exportedNames = (text: string): string[] =>
  [...text.matchAll(/^export (?:const|let|function) (\w+)/gm)].map((m) => m[1]);
const filesMatching = (pattern: RegExp): string[] =>
  [...SOURCES].filter(([, text]) => pattern.test(text)).map(([file]) => file).sort();

const WIND = "game/wind.ts";
const BOARD_WIND = "board/visuals/wind.ts";
const SCENE_WIND = "board/visuals/sceneWind.ts";

/** Names that hold a wind's direction. */
const WIND_DIRECTION_NAME = /wind(?!ow)\w*(angle|dir|direction|toward|azimuth|bearing|heading)|(angle|dir|direction|toward|azimuth|bearing|heading)\w*wind(?!ow)/i;
/** What a wind direction may be made from: the scene's wind, or a name already derived from it, or a wind passed in. */
const FROM_THE_WIND = /\bSCENE_WIND\b|\bWIND_ANGLE\b|\bWIND_TOWARD\b|\bPALM_WIND_DIR\b|\bwind\.(angle|toward)\b|\bwindFor\(/;

/** Each wind direction `file` defines without reading the one wind, as "file: name". */
function ownWindDirections(file: string, text: string): string[] {
  const constants = [...text.matchAll(/\b(?:const|let|var)\s+(\w+)\s*(?::[^=;]+)?=\s*([^;]+);/g)]
    .filter(([, name, value]) => WIND_DIRECTION_NAME.test(name) && !FROM_THE_WIND.test(value))
    .map(([, name]) => `${file}: ${name}`);
  // GLSL: a wind direction written as a literal vector.
  const glsl = [...text.matchAll(/\b(\w*wind(?!ow)\w*)\s*=\s*(?:normalize\s*\(\s*)?vec[234]\s*\(\s*-?[\d.]/gi)].map(
    ([, name]) => `${file}: ${name} (GLSL)`
  );
  return [...constants, ...glsl];
}

describe("one wind (#204)", () => {
  it("the game's wind.ts exports the weather and the function, and no wind of its own", () => {
    expect(exportedNames(source(WIND)).sort()).toEqual(["TRADE_WIND", "windFor"]);
  });

  it("the board defines no wind: its wind.ts only re-exports the game's", () => {
    const statements = source(BOARD_WIND).trim().split(/;\s*/).filter(Boolean);
    expect(statements).toEqual([
      'export { TRADE_WIND, windFor } from "../../game/wind"',
      'export type { Wind, WindWeather } from "../../game/wind"',
    ]);
  });

  it("only the scene's wind calls windFor; everything else reads its record", () => {
    expect(filesMatching(/\bwindFor\(/)).toEqual([SCENE_WIND, WIND]);
  });

  it("no module defines a wind direction of its own", () => {
    const offenders = [...SOURCES].filter(([file]) => file !== WIND).flatMap(([file, text]) => ownWindDirections(file, text));
    expect(offenders).toEqual([]);
  });

  it("catches a planted wind direction, in TypeScript or in GLSL", () => {
    expect(ownWindDirections("planted.ts", "export const PALM_WIND_DIR: readonly [number, number] = [0.8, 0.6];")).toEqual([
      "planted.ts: PALM_WIND_DIR",
    ]);
    expect(ownWindDirections("planted.ts", "const flagWindAngle = Math.PI / 3;")).toEqual(["planted.ts: flagWindAngle"]);
    expect(ownWindDirections("planted.ts", "const s = `vec3 windDir = normalize(vec3(0.8, 0.0, 0.6));`;")).toEqual([
      "planted.ts: windDir (GLSL)",
    ]);
    expect(ownWindDirections("planted.ts", "export const PALM_WIND_DIR = SCENE_WIND.toward;")).toEqual([]);
  });

  it("the sea, the palms, the reefs, the ships, the combat panel's gauge and the fight's smoke read the scene's wind", () => {
    expect(filesMatching(/from "\.{1,2}\/(visuals\/)?sceneWind"/)).toEqual([
      "board/Board.tsx",
      "board/Ship.tsx",
      "board/combatFx/CombatEffects.tsx",
      "board/visuals/oceanWaves.ts",
      "board/visuals/palmSway.ts",
      "board/visuals/shoreFoam.ts",
    ]);
  });

  it("the wind takes no seed: wind.ts imports nothing, sceneWind.ts only the wind", () => {
    expect([...source(WIND).matchAll(/from "([^"]+)";/g)]).toEqual([]);
    expect([...source(SCENE_WIND).matchAll(/from "([^"]+)";/g)].map((m) => m[1])).toEqual(["./wind"]);
  });
});
