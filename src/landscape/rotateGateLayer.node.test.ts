import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROTATE_GATE_Z } from "./rotateGateLayer";

// The rotate gate (#123) covers everything on the page. Read the other layers
// from their sources, so a new layer above it fails here.
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

function filesUnder(dir: string, test: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

const highest = (zs: number[]) => Math.max(0, ...zs);

describe("the rotate gate's layer", () => {
  it("sits above boardgame.io's debug panel", () => {
    const chunks = filesUnder(here("../../node_modules/boardgame.io/dist/esm"), (name) => /^Debug-.*\.js$/.test(name));
    const zs = chunks.flatMap((file) => [...readFileSync(file, "utf8").matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1])));
    expect(zs.length).toBeGreaterThan(0);
    expect(ROTATE_GATE_Z).toBeGreaterThan(highest(zs));
  });

  it("sits above every layer the app's own components set", () => {
    const sources = filesUnder(here(".."), (name) => /\.tsx$/.test(name) && !name.startsWith("RotateGate"));
    const zs = sources.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return [...text.matchAll(/\bz-\[?(\d+)\]?|zIndex:\s*(\d+)/g)].map((m) => Number(m[1] ?? m[2]));
    });
    expect(zs.length).toBeGreaterThan(0);
    expect(ROTATE_GATE_Z).toBeGreaterThan(highest(zs));
  });
});
