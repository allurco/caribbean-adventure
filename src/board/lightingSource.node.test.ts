/**
 * One source of light (#169): every board module takes its light from
 * `lightingFor(timeOfDay)`, through the scene's `Lighting` record, and none
 * holds a lighting value of its own. Read from the sources, since the rule
 * is about who reads what.
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

/** The code without its comments, so prose that names a function or a constant does not count as reading it. */
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
const importedModules = (text: string): string[] => [...text.matchAll(/from "([^"]+)";/g)].map((m) => m[1]);
const filesMatching = (pattern: RegExp): string[] =>
  [...SOURCES].filter(([, text]) => pattern.test(text)).map(([file]) => file).sort();

const LIGHTING = "visuals/lighting.ts";
const SCENE_LIGHTING = "visuals/sceneLighting.ts";

describe("one source of light (#169)", () => {
  it("lighting.ts exports no lighting value, only the time and the function", () => {
    expect(exportedNames(source(LIGHTING)).sort()).toEqual(["GOLDEN_HOUR", "lightingFor"]);
  });

  it("no other module exports a lighting constant", () => {
    // The names the light's values went by before #169, and the obvious new ones.
    const lightingNames =
      /^(SUN|FILL|HAZE|SKY|BLOOM|VIGNETTE|FOG|AMBIENT|HEMISPHERE)_(COLOR|INTENSITY|DIRECTION|OFFSET|ELEVATION_DEG|AZIMUTH_DEG|DISTANCE|NEAR|FAR|TURBIDITY|RAYLEIGH|MIE_\w+|DIFFUSE_FRACTION|THRESHOLD|SMOOTHING|DARKNESS)$|^(EXPOSURE|TONE_MAPPING_EXPOSURE|COLOR_GRADE|GRADE_GAIN)$/;
    const offenders = [...SOURCES].flatMap(([file, text]) =>
      exportedNames(text)
        .filter((name) => lightingNames.test(name))
        .map((name) => `${file}: ${name}`)
    );
    expect(offenders).toEqual([]);
  });

  it("only lighting.ts places a light: nothing else computes a sun or fill direction", () => {
    expect(filesMatching(/\bsunDirection\(/)).toEqual([LIGHTING, "visuals/sunDirection.ts"]);
  });

  it("only the scene's lighting calls lightingFor; everything else reads its record", () => {
    expect(filesMatching(/\blightingFor\(/)).toEqual([LIGHTING, SCENE_LIGHTING]);
  });

  it("every module that mounts a light, fog, background or post effect takes its values from a Lighting", () => {
    const mounts = filesMatching(
      /<(directionalLight|ambientLight|hemisphereLight|pointLight|spotLight)\b|<fog\b|attach="background"|<EffectComposer\b|<Bloom\b|<Vignette\b|toneMappingExposure\s*=/
    );
    expect(mounts).toEqual(["Board.tsx", "PropViewer.tsx", "visuals/FillLight.tsx", "visuals/PostEffects.tsx", "visuals/SunLight.tsx"]);
    for (const file of mounts) expect(source(file), file).toMatch(/Lighting\b|\bSCENE_LIGHTING\b/);
  });

  it("every reader of the scene's light gets it from sceneLighting.ts", () => {
    expect(filesMatching(/from "\.{1,2}\/(visuals\/)?sceneLighting"/)).toEqual([
      "Board.tsx",
      "PropViewer.tsx",
      "useRegionBorders.ts",
      "useWaterGridLines.ts",
      "visuals/ShoreBoulderMeshes.tsx",
    ]);
  });

  it("the light takes no seed: lighting.ts and sceneLighting.ts import nothing seeded (#158 decision 14)", () => {
    expect(importedModules(source(LIGHTING)).sort()).toEqual(["../cameraBounds", "./colourTemperature", "./sunDirection"]);
    expect(importedModules(source(SCENE_LIGHTING))).toEqual(["./lighting"]);
    expect(source(SCENE_LIGHTING)).not.toMatch(/\b(subSeed|mapSeed|seed)\b\s*[(:,)]/);
  });
});
