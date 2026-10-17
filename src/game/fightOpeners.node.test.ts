/**
 * Ports are safe harbours (#388): only the moves that check the harbour rule
 * may open a fight. Every fight opens through `openFight`, so this reads the
 * sources' syntax trees and holds its callers to `attackShip` and `attackNPC`.
 * An NPC, event card or new move that opens a fight trips it, and must keep
 * the harbour peace (`harbourKeepsApart`) before it is added here.
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

/** The name of the nearest enclosing object property or named function, else "(top level)". */
function enclosingName(node: ts.Node): string {
  for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
    if ((ts.isPropertyAssignment(at) || ts.isMethodDeclaration(at) || ts.isFunctionDeclaration(at)) && at.name) {
      return at.name.getText();
    }
  }
  return "(top level)";
}

/** Every call of `openFight`, as "file: enclosing name". */
function openFightCallers(): string[] {
  return sourcesUnder(GAME_DIR).flatMap((path) => {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "openFight") {
        found.push(`${relative(GAME_DIR, path)}: ${enclosingName(node)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  });
}

describe("who may open a fight (#388)", () => {
  it("only the attackShip and attackNPC moves, which keep the harbour peace", () => {
    expect(openFightCallers().sort()).toEqual(["Game.ts: attackNPC", "Game.ts: attackShip"]);
  });
});
