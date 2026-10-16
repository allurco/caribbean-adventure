/**
 * The rules are a pure function of the seed and the moves (#320, ADR 0008):
 * the server runs them per request in whatever function instance is warm, and
 * a replay must reach the same G. So nothing under `src/game/` reads the
 * clock, draws from `Math.random` (game randomness is boardgame.io's
 * `random`), or keeps a counter in module state, which restarts with every
 * process. Counters live in G (`npcIdCounter`, `idCounter`). Read from the
 * sources, since the rule is about what the code may use at all.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const GAME_DIR = fileURLToPath(new URL(".", import.meta.url));

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The code without its comments, so prose that names the clock does not count. */
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SOURCES = sourcesUnder(GAME_DIR).map((path) => ({
  file: relative(GAME_DIR, path).split("\\").join("/"),
  text: stripComments(readFileSync(path, "utf8")),
}));

/** Each line of a game source that matches `pattern`, as "file: line". */
const linesMatching = (pattern: RegExp): string[] =>
  SOURCES.flatMap(({ file, text }) => text.split("\n").filter((line) => pattern.test(line)).map((line) => `${file}: ${line.trim()}`));

describe("the game's rules depend only on the seed and the moves (#320)", () => {
  it("scans the game's sources", () => {
    expect(SOURCES.map(({ file }) => file)).toContain("Game.ts");
  });

  it("never read the clock", () => {
    expect(linesMatching(/\bDate\.now\s*\(|\bnew Date\b|\bperformance\.now\s*\(/)).toEqual([]);
  });

  it("never draw from Math.random", () => {
    expect(linesMatching(/\bMath\.random\b/)).toEqual([]);
  });

  it("keep no mutable state in a module: a counter belongs in G", () => {
    expect(linesMatching(/^(?:export\s+)?(?:let|var)\s/)).toEqual([]);
  });
});
