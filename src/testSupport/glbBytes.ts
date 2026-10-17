/**
 * Writes a binary glTF from a JSON document and a binary chunk, for tests
 * that need a `.glb` the reader (`src/board/glb.ts`) can open: a small
 * synthetic one, or a committed model with something planted in it.
 */

const pad4 = (bytes: Uint8Array, fill: number): Uint8Array => {
  const out = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(fill);
  out.set(bytes);
  return out;
};

export function writeGlb(json: unknown, bin: Uint8Array = new Uint8Array(0)): Uint8Array {
  const jsonBytes = pad4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binBytes = pad4(bin, 0);
  const total = 12 + 8 + jsonBytes.length + (binBytes.length ? 8 + binBytes.length : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  if (binBytes.length) {
    const at = 20 + jsonBytes.length;
    view.setUint32(at, binBytes.length, true);
    view.setUint32(at + 4, 0x004e4942, true);
    out.set(binBytes, at + 8);
  }
  return out;
}

/** A buffer of little-endian values, each written by `kind`, to lay accessors over. */
export function packed(kind: "f32" | "u16" | "u8", values: readonly number[]): Uint8Array {
  const size = kind === "f32" ? 4 : kind === "u16" ? 2 : 1;
  const out = new Uint8Array(Math.ceil((values.length * size) / 4) * 4);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => {
    if (kind === "f32") view.setFloat32(i * size, v, true);
    else if (kind === "u16") view.setUint16(i * size, v, true);
    else view.setUint8(i, v);
  });
  return out;
}

/** Several buffers end to end, with the byte offset each starts at. */
export function concatBuffers(parts: readonly Uint8Array[]): { bin: Uint8Array; offsets: number[] } {
  const offsets: number[] = [];
  let length = 0;
  for (const part of parts) {
    offsets.push(length);
    length += part.length;
  }
  const bin = new Uint8Array(length);
  parts.forEach((part, i) => bin.set(part, offsets[i]));
  return { bin, offsets };
}
