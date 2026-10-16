/**
 * The rules are a pure function of the seed and the moves (#320, ADR 0008):
 * the server runs them per request in whatever function instance is warm, and
 * a replay must reach the same G. So nothing under `src/game/` reads the
 * clock, draws from `Math.random` or `crypto` (game randomness is
 * boardgame.io's `random`), or keeps state in a module, which restarts with
 * every process. Counters live in G (`npcIdCounter`, `missionIdCounters`,
 * `lootIdCounter`). Read from the sources' syntax trees, since the rule is
 * about what the code may use at all; comments and strings do not count.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import ts from "typescript";

const GAME_DIR = fileURLToPath(new URL(".", import.meta.url));

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Reads of the clock or of randomness outside boardgame.io's: `Date.now`, `performance.now`, `Math.random`, anything on `crypto`. */
const FORBIDDEN_MEMBERS: Record<string, ((member: string) => boolean) | undefined> = {
  Date: (member) => member === "now",
  performance: (member) => member === "now",
  Math: (member) => member === "random",
  crypto: () => true,
};

/**
 * Module-level collections a module could fill as it runs: a `Map` or `Set`
 * made at the top level is where a counter or a cache that outlives one match
 * would hide. Which top-level object or array literal is later written to
 * cannot be told from the syntax alone, so only these are flagged.
 */
const MUTABLE_COLLECTIONS = new Set(["Map", "Set"]);

/** What in `text` (a module's source) breaks the rule, each as a short description and the code. */
function nondeterminismIn(text: string, file = "source.ts"): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const at = (node: ts.Node, what: string) => found.push(`${what}: ${node.getText(source)}`);

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) {
      at(statement, "module-level let/var");
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      const init = declaration.initializer;
      if (init && ts.isNewExpression(init) && ts.isIdentifier(init.expression) && MUTABLE_COLLECTIONS.has(init.expression.text)) {
        at(declaration, "module-level collection");
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      if (FORBIDDEN_MEMBERS[node.expression.text]?.(node.name.text)) at(node, "clock or randomness");
    } else if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && ts.isIdentifier(node.expression) && node.expression.text === "Date") {
      at(node, "clock");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const VIOLATIONS = sourcesUnder(GAME_DIR).flatMap((path) => {
  const file = relative(GAME_DIR, path).split("\\").join("/");
  return nondeterminismIn(readFileSync(path, "utf8"), file).map((found) => `${file}: ${found}`);
});

describe("the scan for non-determinism", () => {
  it("finds the clock, randomness and module state in code", () => {
    const code = [
      "let counter = 0;",
      "export var other = 1;",
      "const seen = new Set<string>();",
      "const byId = new Map();",
      "function f() { return Date.now() + performance.now() + Math.random(); }",
      "const today = () => new Date();",
      "const stamp = () => Date();",
      "const id = () => crypto.randomUUID();",
    ].join("\n");
    expect(nondeterminismIn(code)).toEqual([
      "module-level let/var: let counter = 0;",
      "module-level let/var: export var other = 1;",
      "module-level collection: seen = new Set<string>()",
      "module-level collection: byId = new Map()",
      "clock or randomness: Date.now",
      "clock or randomness: performance.now",
      "clock or randomness: Math.random",
      "clock: new Date()",
      "clock: Date()",
      "clock or randomness: crypto.randomUUID",
    ]);
  });

  it("passes comments, strings, local lets and constant tables", () => {
    const code = [
      "// Date.now() and Math.random are not used here",
      "/* let counter = 0; new Date() */",
      'const NOTE = "never call Date.now() or crypto.randomUUID()";',
      "const TABLE = { a: 1 } as const;",
      'const NAMES = ["a", "b"];',
      "export function f(rng: () => number) { let n = 0; n += rng(); return `Math.random ${n}`; }",
    ].join("\n");
    expect(nondeterminismIn(code)).toEqual([]);
  });
});

describe("the game's rules depend only on the seed and the moves (#320)", () => {
  it("scans the game's sources", () => {
    expect(sourcesUnder(GAME_DIR).some((path) => path.endsWith("Game.ts"))).toBe(true);
  });

  it("never read the clock, draw outside boardgame.io's random, or keep state in a module", () => {
    expect(VIOLATIONS).toEqual([]);
  });
});
