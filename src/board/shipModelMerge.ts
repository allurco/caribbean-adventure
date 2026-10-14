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
import { clothAttributes, decalBellies, sailBellies } from "./shipWindGeometry";
import { FLAG_RIPPLE_SHARE } from "./shipWind";

type Role = "plain" | "tinted" | "flag";

/** The parts that move in the wind (#204), by node name. */
export interface ShipWindParts {
  /** The sails, modelled full. */
  readonly sails: string;
  /** The parts lying on the sails, which move with them: the patches and the owner's band. */
  readonly sailDecals: readonly string[];
  /** The cloth that streams downwind: the flag and the pennant. */
  readonly cloth: readonly string[];
}

/** The vertex attributes the wind's shader reads (shipWind.ts), with their sizes. */
const WIND_ATTRIBUTES = { windSail: 3, windFlagHoist: 3, windFlagLocal: 4 } as const;

/**
 * Merges `scene` into a new group holding one mesh per merge group: the
 * parts sharing a material, with the parts named in `tintedParts` (or under
 * a node so named) kept apart in their own group, flagged
 * `userData.tinted`, so a ship can colour them through its own material copy
 * (#134). The part named `flagPart` is kept apart too, flagged
 * `userData.flag`, with texture coordinates of its own running hoist to fly
 * and foot to head (`flagUvs`), so a ship can fly its nation's flag on it.
 * With `wind`, the sails, the parts on them and the cloth carry the
 * attributes the wind's shader reads (`shipWindGeometry.ts`), and their
 * meshes are flagged `userData.wind`: no extra meshes. Geometry is baked
 * into the scene's frame; the materials are the loaded ones, shared.
 * `scene` itself is left as it is.
 */
export function mergeShipModel(scene: Object3D, tintedParts: readonly string[], flagPart?: string, wind?: ShipWindParts): Group {
  scene.updateMatrixWorld(true);
  const toScene = new Matrix4().copy(scene.matrixWorld).invert();
  const groups = new Map<string, { material: Material; role: Role; geometries: BufferGeometry[] }>();
  const parts: { mesh: Mesh; geometry: BufferGeometry }[] = [];

  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) throw new Error(`mergeShipModel: ${mesh.name} has several materials`);
    const material = mesh.material;
    const role: Role = isPart(mesh, scene, tintedParts) ? "tinted" : flagPart && isPart(mesh, scene, [flagPart]) ? "flag" : "plain";
    const key = `${material.uuid}|${role}`;
    const group = groups.get(key) ?? { material, role, geometries: [] };
    groups.set(key, group);
    const geometry = bakedGeometry(mesh, toScene);
    group.geometries.push(geometry);
    parts.push({ mesh, geometry });
  });
  if (wind) addWindAttributes(parts, scene, wind);

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
    mesh.userData.wind = geometry.hasAttribute("windFlagLocal");
    if (mesh.userData.wind) reachInTheWind(geometry);
    merged.add(mesh);
  }
  return merged;
}

/**
 * Gives the sails, the parts on them and the cloth the wind's attributes, each
 * in the scene's frame; every other attribute is zero on them, so a sail is
 * no cloth and a flag has no belly.
 */
function addWindAttributes(parts: { mesh: Mesh; geometry: BufferGeometry }[], scene: Object3D, wind: ShipWindParts): void {
  const sails = parts.filter(({ mesh }) => isPart(mesh, scene, [wind.sails]));
  const sailPositions: number[] = [];
  const sailIndex: number[] = [];
  for (const { geometry } of sails) {
    const base = sailPositions.length / 3;
    sailPositions.push(...positionsOf(geometry));
    for (const k of geometry.index!.array) sailIndex.push(base + k);
  }
  const bellies = sailBellies(sailPositions, sailIndex);

  let sailOffset = 0;
  for (const { mesh, geometry } of parts) {
    const count = geometry.attributes.position.count;
    const positions = positionsOf(geometry);
    const values: Partial<Record<keyof typeof WIND_ATTRIBUTES, Float32Array>> = {};
    if (sails.some((sail) => sail.geometry === geometry)) {
      values.windSail = bellies.slice(3 * sailOffset, 3 * (sailOffset + count));
      sailOffset += count;
    } else if (isPart(mesh, scene, wind.sailDecals)) {
      values.windSail = decalBellies(positions, sailPositions, sailIndex);
    } else if (isPart(mesh, scene, wind.cloth)) {
      const cloth = clothAttributes(positions);
      values.windFlagHoist = cloth.hoist;
      values.windFlagLocal = cloth.local;
    } else continue;
    for (const [name, size] of Object.entries(WIND_ATTRIBUTES) as [keyof typeof WIND_ATTRIBUTES, number][]) {
      geometry.setAttribute(name, new BufferAttribute(values[name] ?? new Float32Array(count * size), size));
    }
  }
}

/**
 * Widens a wind mesh's bounding sphere to everywhere its cloth can blow
 * (#204): a cloth turns about its hoist, so it can reach its length the other
 * way, rippling across it; a sail's belly at most doubles. So the mesh is not
 * culled from the view or the shadow while its cloth is still in them.
 */
function reachInTheWind(geometry: BufferGeometry): void {
  const sail = geometry.attributes.windSail;
  const cloth = geometry.attributes.windFlagLocal;
  let reach = 0;
  for (let k = 0; k < geometry.attributes.position.count; k++) {
    const belly = Math.hypot(sail.getX(k), sail.getY(k), sail.getZ(k));
    reach = Math.max(reach, 2 * belly, 2 * cloth.getW(k) * (1 + FLAG_RIPPLE_SHARE));
  }
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += reach;
}

/** A geometry's positions as plain x, y, z triples, interleaved or not. */
function positionsOf(geometry: BufferGeometry): Float32Array {
  const position = geometry.attributes.position;
  const out = new Float32Array(position.count * 3);
  for (let k = 0; k < position.count; k++) out.set([position.getX(k), position.getY(k), position.getZ(k)], 3 * k);
  return out;
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
