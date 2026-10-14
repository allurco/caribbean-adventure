/**
 * Merging a loaded ship model (#136): the generator's file has dozens of
 * parts (one node per cannon, port lid, barrel…), each its own draw call.
 * Once per loaded file the parts are baked into one mesh per merge group, so
 * a ship costs a handful of draw calls. Pure three.js, no React.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  type InterleavedBufferAttribute,
  type Material,
  type Object3D,
  type TypedArray,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flagUvs } from "./flagUvs";

type Role = "plain" | "tinted" | "flag";

/**
 * Merges `scene` into a new group holding one mesh per merge group: the
 * parts sharing a material, with the parts named in `tintedParts` (or under
 * a node so named) kept apart in their own group, flagged
 * `userData.tinted`, so a ship can colour them through its own material copy
 * (#134). The part named `flagPart` is kept apart too, flagged
 * `userData.flag`, with texture coordinates of its own running hoist to fly
 * and foot to head (`flagUvs`), so a ship can fly its nation's flag on it.
 * Geometry is baked into the scene's frame; the materials are the loaded
 * ones, shared. `scene` itself is left as it is.
 */
export function mergeShipModel(scene: Object3D, tintedParts: readonly string[], flagPart?: string): Group {
  scene.updateMatrixWorld(true);
  const toScene = new Matrix4().copy(scene.matrixWorld).invert();
  const groups = new Map<string, { material: Material; role: Role; geometries: BufferGeometry[] }>();

  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) throw new Error(`mergeShipModel: ${mesh.name} has several materials`);
    const material = mesh.material;
    const role: Role = isPart(mesh, scene, tintedParts) ? "tinted" : flagPart && isPart(mesh, scene, [flagPart]) ? "flag" : "plain";
    const key = `${material.uuid}|${role}`;
    const group = groups.get(key) ?? { material, role, geometries: [] };
    groups.set(key, group);
    group.geometries.push(bakedGeometry(mesh, toScene));
  });

  const merged = new Group();
  merged.name = scene.name;
  for (const { material, role, geometries } of groups.values()) {
    const geometry = mergeGeometries(withSharedAttributes(geometries));
    if (!geometry) throw new Error(`mergeShipModel: the parts in ${material.name} do not merge`);
    for (const part of geometries) part.dispose();
    if (role === "flag") geometry.setAttribute("uv", new BufferAttribute(flagUvs(geometry.attributes.position.array), 2));
    const mesh = new Mesh(geometry, material);
    mesh.name = role === "plain" ? material.name : `${material.name}_${role}`;
    mesh.userData.tinted = role === "tinted";
    mesh.userData.flag = role === "flag";
    merged.add(mesh);
  }
  return merged;
}

/** Whether `mesh` or one of its ancestors below `scene` is one of the parts named. */
function isPart(mesh: Object3D, scene: Object3D, names: readonly string[]): boolean {
  for (let node: Object3D | null = mesh; node && node !== scene; node = node.parent) {
    if (names.includes(node.name)) return true;
  }
  return false;
}

/** A copy of the mesh's geometry in the scene's frame, indexed, without morph targets. */
function bakedGeometry(mesh: Mesh, toScene: Matrix4): BufferGeometry {
  const geometry = mesh.geometry.clone();
  geometry.morphAttributes = {};
  const matrix = new Matrix4().multiplyMatrices(toScene, mesh.matrixWorld);
  geometry.applyMatrix4(matrix);
  if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
  // A mirroring transform turns the faces inside out; wind them back.
  if (matrix.determinant() < 0) flipWinding(geometry);
  return geometry;
}

function flipWinding(geometry: BufferGeometry): void {
  const index = geometry.index!;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  index.needsUpdate = true;
}

/**
 * The geometries with one set of attributes, so they merge: an attribute only
 * some parts carry (a flag's second UV set) is zero-filled on the others.
 */
function withSharedAttributes(geometries: BufferGeometry[]): BufferGeometry[] {
  const attributes = new Map<string, BufferAttribute | InterleavedBufferAttribute>();
  for (const geometry of geometries) {
    for (const [name, attribute] of Object.entries(geometry.attributes)) if (!attributes.has(name)) attributes.set(name, attribute);
  }
  for (const geometry of geometries) {
    const count = geometry.attributes.position.count;
    for (const [name, like] of attributes) {
      if (geometry.hasAttribute(name)) continue;
      const ArrayType = like.array.constructor as new (length: number) => TypedArray;
      geometry.setAttribute(name, new BufferAttribute(new ArrayType(count * like.itemSize), like.itemSize, like.normalized));
    }
  }
  return geometries;
}
