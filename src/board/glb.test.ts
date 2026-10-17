import { describe, expect, it } from "vitest";
import { concatBuffers, packed, writeGlb } from "../testSupport/glbBytes";
import { glbAnchors, glbAttributeValues, glbPrimitiveAttributes, glbTriangles, glbTriangleSoup, readGlb } from "./glb";

/**
 * One quad (two triangles) under a node turned a quarter about +Y and moved
 * 10 along +X, with a ushort-normalised COLOR_0 and a float `_TINT`, and an
 * empty node, the anchor, as its child.
 */
function quadGlb() {
  const positions = packed("f32", [-2, 0, 0, 1, 0, 0, 1, 1, 0, -2, 1, 0]);
  const normals = packed("f32", [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const colours = packed("u16", [65535, 0, 0, 65535, 0, 65535, 0, 65535, 0, 0, 65535, 65535, 32768, 32768, 32768, 65535]);
  const tints = packed("f32", [1, 1, 5, 5]);
  const indices = packed("u16", [0, 1, 2, 0, 2, 3]);
  const { bin, offsets } = concatBuffers([positions, normals, colours, tints, indices]);
  const view = (i: number, length: number) => ({ buffer: 0, byteOffset: offsets[i], byteLength: length });
  const turn = Math.SQRT1_2; // a quarter turn about +Y
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: "Wall", mesh: 0, translation: [10, 0, 0], rotation: [0, turn, 0, turn], children: [1] },
      { name: "Chimney_00", translation: [0, 2, 0] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2, _TINT: 3 }, indices: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, type: "VEC3", count: 4, min: [-2, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, type: "VEC3", count: 4 },
      { bufferView: 2, componentType: 5123, normalized: true, type: "VEC4", count: 4 },
      { bufferView: 3, componentType: 5126, type: "SCALAR", count: 4 },
      { bufferView: 4, componentType: 5123, type: "SCALAR", count: 6 },
    ],
    bufferViews: [view(0, 48), view(1, 48), view(2, 32), view(3, 16), view(4, 12)],
    buffers: [{ byteLength: bin.length }],
  };
  return readGlb(writeGlb(json, bin));
}

const close = (got: ArrayLike<number>, want: readonly number[]) => {
  expect(got.length).toBe(want.length);
  want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 4));
};

describe("glb", () => {
  it("names each drawn primitive's attributes", () => {
    expect(glbPrimitiveAttributes(quadGlb())).toEqual([["POSITION", "NORMAL", "COLOR_0", "_TINT"]]);
  });

  it("decodes a vertex attribute, normalised integers to [0, 1]", () => {
    const glb = quadGlb();
    expect(glbAttributeValues(glb, "_TINT")).toEqual([[1], [1], [5], [5]]);
    close(glbAttributeValues(glb, "COLOR_0")[3], [0.5, 0.5, 0.5, 1]);
    expect(glbAttributeValues(glb, "TEXCOORD_0")).toEqual([]);
  });

  it("places an anchor (a node that draws nothing) through its parents", () => {
    const anchors = glbAnchors(quadGlb());
    expect([...anchors.keys()]).toEqual(["Chimney_00"]);
    close(anchors.get("Chimney_00")!, [10, 2, 0]);
  });

  it("unrolls every triangle into the model's frame, normals turned, colours as RGB", () => {
    const glb = quadGlb();
    const soup = glbTriangleSoup(glb);
    expect(soup.vertexCount).toBe(6);
    expect(soup.vertexCount / 3).toBe(glbTriangles(glb));
    // The quad's (1, 0, 0) turned a quarter about +Y is (0, 0, -1), then moved 10 along +X;
    // its (-2, 0, 0) is (0, 0, 2), moved the same.
    close(soup.positions.slice(0, 6), [10, 0, 2, 10, 0, -1]);
    // Its +Z normal turned the same way is +X.
    close(soup.normals.slice(0, 3), [1, 0, 0]);
    close(soup.colors.slice(0, 6), [1, 0, 0, 0, 1, 0]);
    close(soup.tints, [1, 1, 5, 1, 5, 5]);
  });
});
