/**
 * The wind's reading of the committed ship models (#204): the sails' flat
 * planes, the decals on them and the cloth's hoists, worked out from each
 * file's shape (shipWindGeometry.ts) as the board does when it loads it.
 * Type-checked by tsconfig.node.json, as it uses Node's fs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SHIP_MODELS } from "./shipModels";
import { glbPartMesh, readGlb } from "./glb";
import { clothAttributes, decalBellies, sailBellies, sailPanels } from "./shipWindGeometry";

const SHIPS_DIR = new URL("../../public/ships/", import.meta.url);

const lengths = (bellies: Float32Array) =>
  Array.from({ length: bellies.length / 3 }, (_, k) => Math.hypot(bellies[3 * k], bellies[3 * k + 1], bellies[3 * k + 2]));

describe("the ship models in the wind", () => {
  for (const [shipClass, model] of Object.entries(SHIP_MODELS)) {
    if (!model) continue;
    const glb = readGlb(new Uint8Array(readFileSync(new URL(model.file, SHIPS_DIR))));
    const sails = glbPartMesh(glb, model.parts.sails);

    it(`finds the ${shipClass}'s sails, each bellied out of a flat plane by less than its own width`, () => {
      const panels = sailPanels(sails.positions, sails.index);
      expect(panels.length).toBeGreaterThanOrEqual(3);
      const bellies = sailBellies(sails.positions, sails.index);
      for (const panel of panels) {
        const depths = panel.vertices.map((k) => Math.hypot(bellies[3 * k], bellies[3 * k + 1], bellies[3 * k + 2]));
        const xs = panel.vertices.map((k) => sails.positions[3 * k]);
        const ys = panel.vertices.map((k) => sails.positions[3 * k + 1]);
        const zs = panel.vertices.map((k) => sails.positions[3 * k + 2]);
        const width = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), Math.max(...ys) - Math.min(...ys));
        expect(Math.max(...depths)).toBeGreaterThan(0.02 * width);
        expect(Math.max(...depths)).toBeLessThan(0.3 * width);
        // Its corners lie on the plane: some vertices have no belly at all.
        expect(Math.min(...depths)).toBeLessThan(1e-3 * width);
      }
    });

    it(`moves the ${shipClass}'s patches and owner's band with the sails beneath them`, () => {
      const deepest = Math.max(...lengths(sailBellies(sails.positions, sails.index)));
      for (const name of model.sailDecals) {
        const decal = glbPartMesh(glb, name);
        expect(decal.positions.length).toBeGreaterThan(0);
        const bellies = lengths(decalBellies(decal.positions, sails.positions, sails.index));
        expect(Math.max(...bellies)).toBeGreaterThan(0);
        expect(Math.max(...bellies)).toBeLessThanOrEqual(deepest + 1e-6);
      }
    });

    for (const part of [model.parts.flag, model.parts.pennant]) {
      it(`hoists the ${shipClass}'s ${part} at its masthead and flies it forward, on the generator's following wind`, () => {
        const { positions } = glbPartMesh(glb, part);
        const cloth = clothAttributes(positions);
        const [hx, , flyAngle] = cloth.hoist;
        // On the centreline, at a mast.
        expect(Math.abs(hx)).toBeLessThan(0.3);
        // The bow is along −Z: a fly angle near −90°.
        expect(Math.abs(flyAngle + Math.PI / 2)).toBeLessThan((50 * Math.PI) / 180);
        expect(cloth.local[3]).toBeGreaterThan(1);
      });
    }
  }
});
