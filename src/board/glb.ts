/**
 * Reads what the ship asset test checks out of a binary glTF (`.glb`): the
 * named parts' bounds in the model's frame, the triangles drawn and the
 * texture sizes. Pure, no Three.js and no Node: it works on the bytes, the
 * JSON chunk's accessor bounds and the image headers.
 */

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
}

interface GltfJson {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives: { attributes: { POSITION?: number }; indices?: number }[] }[];
  accessors?: { count: number; min?: number[]; max?: number[] }[];
  images?: { name?: string; bufferView?: number; uri?: string }[];
  bufferViews?: { byteOffset?: number; byteLength: number }[];
}

export interface Glb {
  readonly byteLength: number;
  readonly json: GltfJson;
  readonly bin: Uint8Array;
}

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function readGlb(bytes: Uint8Array): Glb {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error("not a binary glTF");
  let json: GltfJson | null = null;
  let bin: Uint8Array = new Uint8Array(0);
  for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
    else if (type === CHUNK_BIN) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error("binary glTF without a JSON chunk");
  return { byteLength: bytes.byteLength, json, bin };
}

const rotate = ([x, y, z]: Vec3, [qx, qy, qz, qw]: Quat): Vec3 => {
  // v' = v + 2w(q×v) + 2q×(q×v)
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
};

const nodeTransform = (node: GltfNode) => (p: Vec3): Vec3 => {
  const s = node.scale ?? [1, 1, 1];
  const r = rotate([p[0] * s[0], p[1] * s[1], p[2] * s[2]], node.rotation ?? [0, 0, 0, 1]);
  const t = node.translation ?? [0, 0, 0];
  return [r[0] + t[0], r[1] + t[1], r[2] + t[2]];
};

interface Placed {
  readonly node: GltfNode;
  readonly toModel: (p: Vec3) => Vec3;
}

/** Every node drawn by the default scene, with the transform from its frame to the model's. */
const placedNodes = (json: GltfJson): Placed[] => {
  const nodes = json.nodes ?? [];
  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene?.nodes ?? nodes.map((_, i) => i);
  const placed: Placed[] = [];
  const visit = (index: number, parent: (p: Vec3) => Vec3) => {
    const node = nodes[index];
    const own = nodeTransform(node);
    const toModel = (p: Vec3) => parent(own(p));
    placed.push({ node, toModel });
    for (const child of node.children ?? []) visit(child, toModel);
  };
  for (const root of roots) visit(root, (p) => p);
  return placed;
};

const meshBounds = (json: GltfJson, mesh: number, toModel: (p: Vec3) => Vec3): Bounds | null => {
  let bounds: Bounds | null = null;
  for (const primitive of json.meshes?.[mesh]?.primitives ?? []) {
    const accessor = primitive.attributes.POSITION === undefined ? undefined : json.accessors?.[primitive.attributes.POSITION];
    if (!accessor?.min || !accessor.max) continue;
    const [lo, hi] = [accessor.min, accessor.max];
    for (let corner = 0; corner < 8; corner++) {
      const p = toModel([corner & 1 ? hi[0] : lo[0], corner & 2 ? hi[1] : lo[1], corner & 4 ? hi[2] : lo[2]]);
      bounds = bounds ? union(bounds, { min: p, max: p }) : { min: p, max: p };
    }
  }
  return bounds;
};

const union = (a: Bounds, b: Bounds): Bounds => ({
  min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
  max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
});

/** Each named node's bounds in the model's frame (copies under one name merge). */
export function glbPartBounds(glb: Glb): Map<string, Bounds> {
  const parts = new Map<string, Bounds>();
  for (const { node, toModel } of placedNodes(glb.json)) {
    if (node.mesh === undefined || !node.name) continue;
    const bounds = meshBounds(glb.json, node.mesh, toModel);
    if (!bounds) continue;
    const seen = parts.get(node.name);
    parts.set(node.name, seen ? union(seen, bounds) : bounds);
  }
  return parts;
}

/** The whole model's bounds in its own frame. */
export function glbBounds(glb: Glb): Bounds | null {
  let all: Bounds | null = null;
  for (const bounds of glbPartBounds(glb).values()) all = all ? union(all, bounds) : bounds;
  return all;
}

/** The triangles drawn: every mesh counted once per node that draws it. */
export function glbTriangles(glb: Glb): number {
  let triangles = 0;
  for (const { node } of placedNodes(glb.json)) {
    if (node.mesh === undefined) continue;
    for (const primitive of glb.json.meshes?.[node.mesh]?.primitives ?? []) {
      const counted = primitive.indices ?? primitive.attributes.POSITION;
      triangles += counted === undefined ? 0 : (glb.json.accessors?.[counted]?.count ?? 0) / 3;
    }
  }
  return triangles;
}

const pngSize = (b: Uint8Array): [number, number] | null => {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
};

const jpegSize = (b: Uint8Array): [number, number] | null => {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const length = (b[i + 2] << 8) | b[i + 3];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    i += 2 + length;
  }
  return null;
};

/** Each embedded image's width and height in pixels, read from its PNG or JPEG header. */
export function glbImageSizes(glb: Glb): { name: string; width: number; height: number }[] {
  return (glb.json.images ?? []).map((image, i) => {
    const view = image.bufferView === undefined ? undefined : glb.json.bufferViews?.[image.bufferView];
    const bytes = view ? glb.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength) : new Uint8Array(0);
    const size = pngSize(bytes) ?? jpegSize(bytes);
    if (!size) throw new Error(`image ${image.name ?? i} is not an embedded PNG or JPEG`);
    return { name: image.name ?? `image ${i}`, width: size[0], height: size[1] };
  });
}
