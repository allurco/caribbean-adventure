/**
 * The committed ship models under public/ships/, read off disk in Node and
 * held to the catalogue and the board budget (shipAssetCheck.ts). Like the
 * sound registry test, it keeps the catalogue and the folder in step.
 * Type-checked by tsconfig.node.json, as it uses Node's fs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { SHIP_MODELS } from "./shipModels";
import { catalogueFileProblems, shipAssetProblems } from "./shipAssetCheck";
import { glbPartPositions, readGlb } from "./glb";
import { flagUvs } from "./flagUvs";

const SHIPS_DIR = new URL("../../public/ships/", import.meta.url);
const SHIPPED = readdirSync(SHIPS_DIR).filter((file) => !file.startsWith("."));

describe("ship assets", () => {
  it("has a file for every catalogue entry and an entry for every file", () => {
    expect(catalogueFileProblems(SHIP_MODELS, SHIPPED)).toEqual([]);
  });

  for (const [shipClass, model] of Object.entries(SHIP_MODELS)) {
    if (!model) continue;
    it(`holds the ${shipClass} (${model.file}) to the budget and the catalogue`, () => {
      const bytes = new Uint8Array(readFileSync(new URL(model.file, SHIPS_DIR)));
      expect(shipAssetProblems(model, bytes)).toEqual([]);
    });

    // The flag the game draws on it (#134) reads the right way round: its
    // hoist at the staff, aft, as it flies forward on the generator's
    // following wind; its head up. Seen from the other side, it is the
    // flag's reverse, as a real flag's is.
    it(`maps the ${shipClass}'s flag hoist to fly and foot to head`, () => {
      const glb = readGlb(new Uint8Array(readFileSync(new URL(model.file, SHIPS_DIR))));
      const points = glbPartPositions(glb, model.parts.flag);
      expect(points.length).toBeGreaterThan(8);
      const uv = flagUvs(points.flat());
      const mean = (pick: (k: number) => boolean, axis: 0 | 1 | 2) => {
        const chosen = points.filter((_, k) => pick(k));
        expect(chosen.length).toBeGreaterThan(0);
        return chosen.reduce((sum, p) => sum + p[axis], 0) / chosen.length;
      };
      // hoist aft of the fly: the bow is along −Z
      expect(mean((k) => uv[2 * k] < 0.1, 2)).toBeGreaterThan(mean((k) => uv[2 * k] > 0.9, 2) + 1);
      // head above the foot, at the hoist where the droop does not reach
      const atHoist = (k: number) => uv[2 * k] < 0.1;
      expect(mean((k) => atHoist(k) && uv[2 * k + 1] > 0.9, 1)).toBeGreaterThan(mean((k) => atHoist(k) && uv[2 * k + 1] < 0.1, 1) + 1);
    });
  }
});
