import { describe, it, expect } from "vitest";
import type { ShipModel } from "./shipModels";
import { catalogueFileProblems, shipAssetProblems } from "./shipAssetCheck";

const MODEL: ShipModel = {
  file: "test.glb",
  lengthMetres: 40,
  beamMetres: 10,
  depthMetres: 8,
  mastheadMetres: 30,
  draftMetres: 4,
  parts: { hull: "Hull", sails: "Sails", flag: "Flag", pennant: "Flag" },
  tintedParts: ["Sails"],
  sailDecals: [],
};

interface Part {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
  triangles: number;
  translation?: [number, number, number];
}

/** The 24 bytes of a PNG up to its IHDR width and height: enough for a size read. */
const pngHeader = (width: number, height: number): number[] => {
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be(width), ...be(height)];
};

const pad4 = (bytes: number[], fill: number): number[] => [...bytes, ...Array((4 - (bytes.length % 4)) % 4).fill(fill)];

/** A GLB holding only what the check reads: nodes, meshes, accessor bounds and counts, and image headers. */
const glb = ({ parts, images = [1024], padTo = 0 }: { parts: Part[]; images?: number[]; padTo?: number }): Uint8Array => {
  const bin: number[] = [];
  const bufferViews: { buffer: 0; byteOffset: number; byteLength: number }[] = [];
  for (const size of images) {
    bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: 24 });
    bin.push(...pngHeader(size, size));
  }
  const json = {
    asset: { version: "2.0" },
    scenes: [{ nodes: parts.map((_, i) => i) }],
    nodes: parts.map((p, i) => ({ name: p.name, mesh: i, ...(p.translation ? { translation: p.translation } : {}) })),
    meshes: parts.map((p, i) => ({ name: p.name, primitives: [{ attributes: { POSITION: 2 * i }, indices: 2 * i + 1 }] })),
    accessors: parts.flatMap((p) => [
      { type: "VEC3", componentType: 5126, count: 3, min: p.min, max: p.max },
      { type: "SCALAR", componentType: 5123, count: p.triangles * 3 },
    ]),
    images: images.map((_, i) => ({ bufferView: i, mimeType: "image/png" })),
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  const jsonBytes = pad4([...new TextEncoder().encode(JSON.stringify(json))], 0x20);
  const binBytes = pad4([...bin, ...Array(Math.max(0, padTo)).fill(0)], 0);
  const u32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  const total = 12 + 8 + jsonBytes.length + 8 + binBytes.length;
  return new Uint8Array([
    ...u32(0x46546c67), ...u32(2), ...u32(total),
    ...u32(jsonBytes.length), ...u32(0x4e4f534a), ...jsonBytes,
    ...u32(binBytes.length), ...u32(0x004e4942), ...binBytes,
  ]);
};

const HULL: Part = { name: "Hull", min: [-5, -4, -20], max: [5, 4, 20], triangles: 2000 };
const SAILS: Part = { name: "Sails", min: [-6, 5, -12], max: [6, 30, 12], triangles: 4000 };
const FLAG: Part = { name: "Flag", min: [0, 26, 10], max: [1, 28, 12], triangles: 80 };
const BOWSPRIT: Part = { name: "Bowsprit", min: [-0.4, 4, -32], max: [0.4, 11, -16], triangles: 100 };
const SHIP = [HULL, SAILS, FLAG, BOWSPRIT];

describe("shipAssetProblems", () => {
  it("passes a model within budget that matches its catalogue entry", () => {
    expect(shipAssetProblems(MODEL, glb({ parts: SHIP }))).toEqual([]);
  });

  it("flags a file over 4 MB", () => {
    const problems = shipAssetProblems(MODEL, glb({ parts: SHIP, padTo: 4_000_001 }));
    expect(problems.join("\n")).toMatch(/bytes/);
  });

  it("flags a model over 20,000 triangles, counting every drawn copy", () => {
    expect(shipAssetProblems(MODEL, glb({ parts: [...SHIP, { ...SAILS, name: "Extra", triangles: 14_000 }] })).join("\n")).toMatch(/triangles/);
  });

  it("flags a texture over 1024 px", () => {
    expect(shipAssetProblems(MODEL, glb({ parts: SHIP, images: [1024, 2048] })).join("\n")).toMatch(/2048/);
  });

  it("flags a named part that is missing", () => {
    expect(shipAssetProblems(MODEL, glb({ parts: [HULL, SAILS, BOWSPRIT] })).join("\n")).toMatch(/Flag/);
  });

  it("flags a part named for the owner's colour that is missing, so a renamed part cannot lose its colour quietly (#134)", () => {
    const tinted: ShipModel = { ...MODEL, tintedParts: ["Sails", "Sail_Band"] };
    expect(shipAssetProblems(tinted, glb({ parts: SHIP })).join("\n")).toMatch(/Sail_Band/);
    expect(shipAssetProblems(tinted, glb({ parts: [...SHIP, { ...FLAG, name: "Sail_Band" }] }))).toEqual([]);
  });

  it("flags a part named as lying on the sails that is missing, so a renamed decal cannot stay put as its sail fills (#204)", () => {
    const decked: ShipModel = { ...MODEL, sailDecals: ["Sail_Patches"] };
    expect(shipAssetProblems(decked, glb({ parts: SHIP })).join("\n")).toMatch(/Sail_Patches/);
    expect(shipAssetProblems(decked, glb({ parts: [...SHIP, { ...FLAG, name: "Sail_Patches" }] }))).toEqual([]);
  });

  it("flags a hull whose length along the bow axis is off the catalogue by more than a few percent", () => {
    const long = { ...HULL, min: [-5, -4, -22], max: [5, 4, 22] } as Part;
    expect(shipAssetProblems(MODEL, glb({ parts: [long, SAILS, FLAG, BOWSPRIT] })).join("\n")).toMatch(/length/);
    const close = { ...HULL, min: [-5, -4, -20.4], max: [5, 4, 20.4] } as Part;
    expect(shipAssetProblems(MODEL, glb({ parts: [close, SAILS, FLAG, BOWSPRIT] }))).toEqual([]);
  });

  it("flags a hull whose beam or depth is off the catalogue", () => {
    const wide = { ...HULL, min: [-7, -4, -20], max: [7, 4, 20] } as Part;
    expect(shipAssetProblems(MODEL, glb({ parts: [wide, SAILS, FLAG, BOWSPRIT] })).join("\n")).toMatch(/beam/);
  });

  it("flags a model whose origin is not at the waterline", () => {
    const afloat = { ...HULL, translation: [0, 5, 0] } as Part;
    expect(shipAssetProblems(MODEL, glb({ parts: [afloat, SAILS, FLAG, BOWSPRIT] })).join("\n")).toMatch(/keel/);
    const sunk = { ...HULL, translation: [0, -5, 0] } as Part;
    expect(shipAssetProblems(MODEL, glb({ parts: [sunk, SAILS, FLAG, BOWSPRIT] })).join("\n")).toMatch(/deck/);
  });

  it("flags a model whose keel is not at the catalogue's draft below the origin (#150)", () => {
    // Still keel below and deck above the origin, but the waterline is 1.5 m off: the hull would float.
    const shallow = { ...HULL, translation: [0, 1.5, 0] } as Part;
    expect(shipAssetProblems(MODEL, glb({ parts: [shallow, SAILS, FLAG, BOWSPRIT] })).join("\n")).toMatch(/draft/);
    const deep = { ...HULL, translation: [0, -1.5, 0] } as Part;
    expect(shipAssetProblems(MODEL, glb({ parts: [deep, SAILS, FLAG, BOWSPRIT] })).join("\n")).toMatch(/draft/);
    const close = { ...HULL, translation: [0, 0.08, 0] } as Part;
    expect(shipAssetProblems(MODEL, glb({ parts: [close, SAILS, FLAG, BOWSPRIT] }))).toEqual([]);
  });

  it("flags a model whose bow points along +Z", () => {
    const reversed = { ...BOWSPRIT, min: [-0.4, 4, 16], max: [0.4, 11, 32] } as Part;
    expect(shipAssetProblems(MODEL, glb({ parts: [HULL, SAILS, FLAG, reversed] })).join("\n")).toMatch(/bow/);
  });

  it("flags a rig whose masthead is off the catalogue (the hover box reaches it, ADR 0006)", () => {
    const taller = { ...SAILS, max: [6, 36, 12] } as Part;
    expect(shipAssetProblems(MODEL, glb({ parts: [HULL, taller, FLAG, BOWSPRIT] })).join("\n")).toMatch(/masthead/);
  });
});

describe("catalogueFileProblems", () => {
  const models = { Sloop: null, Flute: null, Frigate: MODEL, Galleon: null };

  it("passes when every entry has its file and every file its entry", () => {
    expect(catalogueFileProblems(models, ["test.glb"])).toEqual([]);
  });

  it("flags an entry without a file", () => {
    expect(catalogueFileProblems(models, []).join("\n")).toMatch(/test\.glb/);
  });

  it("flags a file without an entry", () => {
    expect(catalogueFileProblems(models, ["test.glb", "stray.glb"]).join("\n")).toMatch(/stray\.glb/);
  });
});
