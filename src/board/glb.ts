/**
 * Reads what the asset tests check, and the board draws, out of a binary
 * glTF (`.glb`): the named parts' bounds and vertex positions in the model's
 * frame, the anchors (named nodes that draw nothing), the triangles drawn,
 * any vertex attribute (`COLOR_0` and the town kit's `_TINT` among them), the
 * whole model as one unindexed triangle soup, and the texture sizes. Pure,
 * no Three.js and no Node: it works on the bytes, the JSON chunk's accessors
 * and the image headers.
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
  meshes?: { primitives: { attributes: { POSITION?: number } & Record<string, number | undefined>; indices?: number }[] }[];
  accessors?: {
    count: number;
    normalized?: boolean;
    min?: number[];
    max?: number[];
    bufferView?: number;
    byteOffset?: number;
    componentType?: number;
    type?: string;
  }[];
  images?: { name?: string; bufferView?: number; uri?: string }[];
  bufferViews?: { byteOffset?: number; byteLength: number; byteStride?: number }[];
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
  /** Turns a direction from the node's frame into the model's (rotations only: the town and ship nodes carry no shear). */
  readonly turnToModel: (d: Vec3) => Vec3;
}

/** Every node drawn by the default scene, with the transform from its frame to the model's. */
const placedNodes = (json: GltfJson): Placed[] => {
  const nodes = json.nodes ?? [];
  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene?.nodes ?? nodes.map((_, i) => i);
  const placed: Placed[] = [];
  const visit = (index: number, parent: (p: Vec3) => Vec3, parentTurn: (d: Vec3) => Vec3) => {
    const node = nodes[index];
    const own = nodeTransform(node);
    const toModel = (p: Vec3) => parent(own(p));
    const turnToModel = (d: Vec3) => parentTurn(rotate(d, node.rotation ?? [0, 0, 0, 1]));
    placed.push({ node, toModel, turnToModel });
    for (const child of node.children ?? []) visit(child, toModel, turnToModel);
  };
  for (const root of roots) visit(root, (p) => p, (d) => d);
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

const FLOAT = 5126;

/** One float VEC3 accessor's values, read off the binary chunk. */
const vec3s = (glb: Glb, index: number): Vec3[] => {
  const accessor = glb.json.accessors?.[index];
  if (!accessor || accessor.bufferView === undefined) return [];
  if (accessor.componentType !== FLOAT || accessor.type !== "VEC3") throw new Error(`accessor ${index} is not a float VEC3`);
  const view = glb.json.bufferViews?.[accessor.bufferView];
  if (!view) return [];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? 12;
  const data = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  const out: Vec3[] = [];
  for (let k = 0; k < accessor.count; k++) {
    const at = start + k * stride;
    out.push([data.getFloat32(at, true), data.getFloat32(at + 4, true), data.getFloat32(at + 8, true)]);
  }
  return out;
};

/** The vertex positions of every node named `name`, in the model's frame. */
export function glbPartPositions(glb: Glb, name: string): Vec3[] {
  const out: Vec3[] = [];
  for (const { node, toModel } of placedNodes(glb.json)) {
    if (node.mesh === undefined || node.name !== name) continue;
    for (const primitive of glb.json.meshes?.[node.mesh]?.primitives ?? []) {
      if (primitive.attributes.POSITION === undefined) continue;
      for (const p of vec3s(glb, primitive.attributes.POSITION)) out.push(toModel(p));
    }
  }
  return out;
}

const INDEX_READERS: Record<number, [number, (view: DataView, at: number) => number]> = {
  5121: [1, (view, at) => view.getUint8(at)],
  5123: [2, (view, at) => view.getUint16(at, true)],
  5125: [4, (view, at) => view.getUint32(at, true)],
};

/** One SCALAR index accessor's values, read off the binary chunk. */
const indices = (glb: Glb, index: number): number[] => {
  const accessor = glb.json.accessors?.[index];
  if (!accessor || accessor.bufferView === undefined) return [];
  const reader = INDEX_READERS[accessor.componentType ?? 0];
  if (!reader || accessor.type !== "SCALAR") throw new Error(`accessor ${index} is not an index accessor`);
  const view = glb.json.bufferViews?.[accessor.bufferView];
  if (!view) return [];
  const [size, read] = reader;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const data = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  return Array.from({ length: accessor.count }, (_, k) => read(data, start + k * size));
};

/**
 * Every node named `name` as one triangle mesh in the model's frame: flat
 * x, y, z positions and the triangles' vertex indices into them.
 */
export function glbPartMesh(glb: Glb, name: string): { positions: number[]; index: number[] } {
  const positions: number[] = [];
  const index: number[] = [];
  for (const { node, toModel } of placedNodes(glb.json)) {
    if (node.mesh === undefined || node.name !== name) continue;
    for (const primitive of glb.json.meshes?.[node.mesh]?.primitives ?? []) {
      if (primitive.attributes.POSITION === undefined) continue;
      const base = positions.length / 3;
      const points = vec3s(glb, primitive.attributes.POSITION);
      for (const p of points) positions.push(...toModel(p));
      const triangles = primitive.indices === undefined ? points.map((_, k) => k) : indices(glb, primitive.indices);
      for (const k of triangles) index.push(base + k);
    }
  }
  return { positions, index };
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

/** Each node that draws nothing, by name, at its origin in the model's frame: the anchors a model carries (`Chimney_00`, `Window_00`, ...). */
export function glbAnchors(glb: Glb): Map<string, Vec3> {
  const anchors = new Map<string, Vec3>();
  for (const { node, toModel } of placedNodes(glb.json)) {
    if (node.mesh === undefined && node.name) anchors.set(node.name, toModel([0, 0, 0]));
  }
  return anchors;
}

/** The primitives each drawing node draws, in scene order. */
const drawnPrimitives = (glb: Glb) =>
  placedNodes(glb.json).flatMap((placed) =>
    placed.node.mesh === undefined ? [] : (glb.json.meshes?.[placed.node.mesh]?.primitives ?? []).map((primitive) => ({ placed, primitive }))
  );

/** The attribute names of every primitive drawn, in scene order. */
export function glbPrimitiveAttributes(glb: Glb): string[][] {
  return drawnPrimitives(glb).map(({ primitive }) => Object.keys(primitive.attributes));
}

const COMPONENTS: Record<number, { size: number; read: (view: DataView, at: number) => number; max: number }> = {
  5120: { size: 1, read: (view, at) => view.getInt8(at), max: 127 },
  5121: { size: 1, read: (view, at) => view.getUint8(at), max: 255 },
  5122: { size: 2, read: (view, at) => view.getInt16(at, true), max: 32767 },
  5123: { size: 2, read: (view, at) => view.getUint16(at, true), max: 65535 },
  5125: { size: 4, read: (view, at) => view.getUint32(at, true), max: 4294967295 },
  5126: { size: 4, read: (view, at) => view.getFloat32(at, true), max: 1 },
};
const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** One accessor's values, decoded to numbers: normalised integers to [0, 1] (or [−1, 1]). */
const accessorValues = (glb: Glb, index: number): number[][] => {
  const accessor = glb.json.accessors?.[index];
  if (!accessor || accessor.bufferView === undefined) return [];
  const component = COMPONENTS[accessor.componentType ?? 0];
  const width = WIDTH[accessor.type ?? ""];
  if (!component || !width) throw new Error(`accessor ${index} is not a vertex accessor this reader knows`);
  const view = glb.json.bufferViews?.[accessor.bufferView];
  if (!view) return [];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? component.size * width;
  // A normalised signed integer's lowest value reads −1, as the spec clamps it; floats are left as they are.
  const decode = accessor.normalized ? (raw: number) => Math.max(-1, raw / component.max) : (raw: number) => raw;
  const data = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  return Array.from({ length: accessor.count }, (_, k) =>
    Array.from({ length: width }, (_, c) => decode(component.read(data, start + k * stride + c * component.size)))
  );
};

/** Every value of the vertex attribute `attribute` over the primitives drawn, decoded; none where no primitive has it. */
export function glbAttributeValues(glb: Glb, attribute: string): number[][] {
  return drawnPrimitives(glb).flatMap(({ primitive }) => {
    const index = primitive.attributes[attribute];
    return index === undefined ? [] : accessorValues(glb, index);
  });
}

/** Every triangle drawn, unindexed, in the model's frame: one entry per corner. */
export interface GlbTriangleSoup {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** `COLOR_0` as RGB. */
  readonly colors: Float32Array;
  /** The town kit's `_TINT` channel, one byte per corner (PRD #392: 0 none to 5 glass), for the village merge to read. */
  readonly tints: Uint8Array;
  readonly vertexCount: number;
}

/** The attributes the soup reads, each one value per POSITION. */
const SOUP_ATTRIBUTES = ["NORMAL", "COLOR_0", "_TINT"] as const;

/**
 * The whole model as one unindexed triangle soup in its own frame: what the
 * board draws a piece from. Throws, rather than drawing defaults, on a
 * primitive whose POSITION is not VEC3, whose NORMAL, COLOR_0 or _TINT is
 * missing or shorter than its POSITION, or whose tint is not a whole number
 * a byte holds: the board then draws the code-built piece instead.
 */
export function glbTriangleSoup(glb: Glb): GlbTriangleSoup {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const tints: number[] = [];
  drawnPrimitives(glb).forEach(({ placed, primitive }, i) => {
    const { POSITION } = primitive.attributes;
    if (POSITION === undefined) return;
    if (glb.json.accessors?.[POSITION]?.type !== "VEC3") throw new Error(`primitive ${i}: POSITION is not VEC3`);
    const p = accessorValues(glb, POSITION);
    const [n, c, t] = SOUP_ATTRIBUTES.map((name) => {
      const index = primitive.attributes[name];
      if (index === undefined) throw new Error(`primitive ${i}: no ${name}`);
      const values = accessorValues(glb, index);
      if (values.length < p.length) throw new Error(`primitive ${i}: ${name} has ${values.length} values for ${p.length} positions`);
      return values;
    });
    const corners = primitive.indices === undefined ? p.map((_, k) => k) : indices(glb, primitive.indices);
    for (const k of corners) {
      const tint = t[k][0];
      if (!Number.isInteger(tint) || tint < 0 || tint > 255) throw new Error(`primitive ${i}: _TINT ${tint} is not a whole number from 0 to 255`);
      positions.push(...placed.toModel(p[k] as Vec3));
      normals.push(...placed.turnToModel(n[k] as Vec3));
      colors.push(...c[k].slice(0, 3));
      tints.push(tint);
    }
  });
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    tints: new Uint8Array(tints),
    vertexCount: positions.length / 3,
  };
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
