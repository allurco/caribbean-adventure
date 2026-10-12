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
  }
});
