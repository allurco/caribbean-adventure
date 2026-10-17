/**
 * The committed town models under public/town/, read off disk in Node and
 * held to the catalogue and the board contract (townAssetCheck.ts), as the
 * ship asset test holds the ships. Files planted from the real one -- drawn
 * over budget, grown past the byte cap, stripped of a tint or an anchor --
 * show the check refuses each. Type-checked by tsconfig.node.json, as it
 * uses Node's fs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { writeGlb } from "../testSupport/glbBytes";
import { glbTriangles, readGlb } from "./glb";
import { AGED_BUILDING_HEIGHT, AGED_BUILDING_PLAN } from "./visuals/agedBuildingGeometry";
import { townModelGeometry } from "./townModelGeometry";
import { TOWN_MODELS } from "./townModels";
import { TOWN_ASSET_BUDGET, townAssetProblems, townCatalogueFileProblems } from "./townAssetCheck";

const TOWN_DIR = new URL("../../public/town/", import.meta.url);
const SHIPPED = readdirSync(TOWN_DIR).filter((file) => !file.startsWith("."));
const tavern = TOWN_MODELS.tavern;
const tavernBytes = () => new Uint8Array(readFileSync(new URL(tavern.file, TOWN_DIR)));

/** The tavern's file with its JSON changed by `edit`, and its binary chunk grown by `pad` bytes. */
const planted = (edit: (json: ReturnType<typeof readGlb>["json"]) => void, pad = 0): Uint8Array => {
  const { json, bin } = readGlb(tavernBytes());
  const copy = structuredClone(json);
  edit(copy);
  const grown = new Uint8Array(bin.length + pad);
  grown.set(bin);
  return writeGlb(copy, grown);
};

describe("town assets", () => {
  it("has a file for every catalogue entry and an entry for every file", () => {
    expect(townCatalogueFileProblems(TOWN_MODELS, SHIPPED)).toEqual([]);
  });

  for (const model of Object.values(TOWN_MODELS)) {
    it(`holds the ${model.kind} (${model.file}) to the budget and the catalogue`, () => {
      expect(townAssetProblems(model, new Uint8Array(readFileSync(new URL(model.file, TOWN_DIR))))).toEqual([]);
    });
  }

  it("flags a file with no catalogue entry, and an entry with no file", () => {
    expect(townCatalogueFileProblems(TOWN_MODELS, [...SHIPPED, "chapel.glb"])).toEqual([
      "chapel.glb is under public/town/ but not in the catalogue",
    ]);
    expect(townCatalogueFileProblems(TOWN_MODELS, [])).toEqual([`${tavern.file} is in the catalogue but not under public/town/`]);
  });

  it("flags a file drawn over its kind's triangle budget", () => {
    // The roof drawn twice more: the same mesh under two more nodes.
    const overBudget = planted((json) => {
      const roof = json.nodes!.findIndex((n) => n.name === "Roof");
      json.nodes!.push({ name: "Roof", mesh: json.nodes![roof].mesh }, { name: "Roof", mesh: json.nodes![roof].mesh });
      json.scenes![0].nodes!.push(json.nodes!.length - 2, json.nodes!.length - 1);
    });
    expect(townAssetProblems(tavern, overBudget).join("\n")).toMatch(/triangles drawn, over 1800/);
  });

  it("flags a file over the byte cap", () => {
    const heavy = planted(() => {}, TOWN_ASSET_BUDGET.maxBytes);
    expect(townAssetProblems(tavern, heavy).join("\n")).toMatch(/bytes, over 250000/);
  });

  it("flags an image, a missing tint channel and a missing anchor", () => {
    const withImage = planted((json) => {
      json.images = [{ name: "atlas", uri: "atlas.png" }];
    });
    expect(townAssetProblems(tavern, withImage).join("\n")).toMatch(/image/);
    const untinted = planted((json) => {
      for (const mesh of json.meshes!) for (const primitive of mesh.primitives) delete primitive.attributes._TINT;
    });
    expect(townAssetProblems(tavern, untinted).join("\n")).toMatch(/_TINT/);
    const noChimney = planted((json) => {
      json.nodes!.find((n) => n.name === "Chimney_00")!.name = "Smoke";
    });
    expect(townAssetProblems(tavern, noChimney).join("\n")).toMatch(/Chimney_00/);
  });

  it("flags a footprint, height or origin off the catalogue's by more than 3 %", () => {
    expect(townAssetProblems({ ...tavern, halfWidthMetres: tavern.halfWidthMetres * 1.04 }, tavernBytes()).join("\n")).toMatch(/width/);
    expect(townAssetProblems({ ...tavern, halfDepthMetres: tavern.halfDepthMetres * 0.96 }, tavernBytes()).join("\n")).toMatch(/depth/);
    expect(townAssetProblems({ ...tavern, heightMetres: tavern.heightMetres * 1.04 }, tavernBytes()).join("\n")).toMatch(/height/);
    const sunk = planted((json) => {
      for (const node of json.nodes!) {
        const [x, y, z] = node.translation ?? [0, 0, 0];
        node.translation = [x, y - 1, z];
      }
    });
    expect(townAssetProblems(tavern, sunk).join("\n")).toMatch(/ground contact/);
    expect(townAssetProblems({ ...tavern, reachMetres: 9 }, tavernBytes()).join("\n")).toMatch(/reaches/);
  });

  // What PortBuildings.tsx draws in the code-built tavern's place: the same
  // local frame at scale 1, so the layout's transforms carry over unchanged.
  it("gives the board the tavern in the code-built tavern's frame, every triangle and colour", () => {
    const bytes = tavernBytes();
    const geometry = townModelGeometry(bytes);
    expect(geometry.vertexCount).toBe(glbTriangles(readGlb(bytes)) * 3);
    const along = (axis: number) => {
      const values = geometry.positions.filter((_, i) => i % 3 === axis);
      return [Math.min(...values), Math.max(...values)];
    };
    expect(along(1)[1]).toBeCloseTo(AGED_BUILDING_HEIGHT.tavern, 3);
    // The walls stand on the code-built plan; the jetty, eaves, sign and benches reach past it.
    expect(-along(0)[0]).toBeGreaterThan(AGED_BUILDING_PLAN.tavern.halfW);
    expect(along(2)[1]).toBeGreaterThan(AGED_BUILDING_PLAN.tavern.halfD);
    expect(geometry.colors.every((c) => c >= 0 && c <= 1)).toBe(true);
    expect(geometry.colors.some((c) => c < 0.9)).toBe(true);
  });
});
