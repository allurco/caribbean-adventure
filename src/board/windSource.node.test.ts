/**
 * One wind (#204): the sea, the palms, the reefs and the ships all take their
 * wind from `windFor(weather)`, through the scene's wind, and no module
 * defines a wind direction of its own. Read from the sources, since the rule
 * is about who defines what (like lightingSource.node.test.ts).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const BOARD_DIR = fileURLToPath(new URL(".", import.meta.url));

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
  sourcesUnder(BOARD_DIR).map((path) => [
    relative(BOARD_DIR, path).split("\\").join("/"),
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

const WIND = "visuals/wind.ts";
const SCENE_WIND = "visuals/sceneWind.ts";

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
  it("wind.ts exports the weather and the function, and no wind of its own", () => {
    expect(exportedNames(source(WIND)).sort()).toEqual(["TRADE_WIND", "windFor"]);
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

  it("the sea, the palms and the reefs read the scene's wind", () => {
    expect(filesMatching(/from "\.{1,2}\/(visuals\/)?sceneWind"/)).toEqual([
      "visuals/oceanWaves.ts",
      "visuals/palmSway.ts",
      "visuals/shoreFoam.ts",
    ]);
  });

  it("the wind takes no seed: wind.ts and sceneWind.ts import nothing seeded", () => {
    expect([...source(WIND).matchAll(/from "([^"]+)";/g)].map((m) => m[1]).sort()).toEqual(["../cameraBounds", "./sunDirection"]);
    expect([...source(SCENE_WIND).matchAll(/from "([^"]+)";/g)].map((m) => m[1])).toEqual(["./wind"]);
  });
});
