/**
 * The rules every committed ship model under `public/ships/` is held to
 * (#130): the board variant's budget, the parts the game relies on, and the
 * generator's contract (real metres, origin at the waterline, bow along
 * glTF −Z) checked against the catalogue, the keel at its declared draft. Pure; the ship asset test feeds
 * it the files.
 */
import type { ShipClass } from "../game/types";
import type { ShipModel } from "./shipModels";
import { glbBounds, glbImageSizes, glbPartBounds, glbTriangles, readGlb } from "./glb";

/** The board variant's budget (#130): what six players and the NPC fleets can afford. */
export const SHIP_ASSET_BUDGET = {
  maxBytes: 4_000_000,
  maxTriangles: 20_000,
  maxTexturePx: 1024,
} as const;

/** How far a measured hull dimension may stray from the catalogue's. */
export const SHIP_DIMENSION_TOLERANCE = 0.03;

const offBy = (measured: number, stated: number) => Math.abs(measured - stated) / stated;

/** Everything wrong with `bytes` as the model for `model`; empty when it passes. */
export function shipAssetProblems(model: ShipModel, bytes: Uint8Array): string[] {
  const problems: string[] = [];
  const { file } = model;
  const { maxBytes, maxTriangles, maxTexturePx } = SHIP_ASSET_BUDGET;
  if (bytes.byteLength > maxBytes) problems.push(`${file}: ${bytes.byteLength} bytes, over ${maxBytes}`);

  const glb = readGlb(bytes);
  const triangles = glbTriangles(glb);
  if (triangles > maxTriangles) problems.push(`${file}: ${triangles} triangles drawn, over ${maxTriangles}`);
  for (const image of glbImageSizes(glb)) {
    if (Math.max(image.width, image.height) > maxTexturePx) {
      problems.push(`${file}: texture ${image.name} is ${image.width}×${image.height}, over ${maxTexturePx} px`);
    }
  }

  const parts = glbPartBounds(glb);
  for (const name of Object.values(model.parts)) {
    if (!parts.has(name)) problems.push(`${file}: no part named ${name}`);
  }
  // A part renamed in the generator would otherwise lose the owner's colour quietly (#134).
  for (const name of model.tintedParts) {
    if (!parts.has(name)) problems.push(`${file}: no part named ${name} to take the owner's colour`);
  }

  const hull = parts.get(model.parts.hull);
  if (hull) {
    const dimensions: [string, number, number][] = [
      ["length", hull.max[2] - hull.min[2], model.lengthMetres],
      ["beam", hull.max[0] - hull.min[0], model.beamMetres],
      ["depth", hull.max[1] - hull.min[1], model.depthMetres],
    ];
    for (const [what, measured, stated] of dimensions) {
      if (offBy(measured, stated) > SHIP_DIMENSION_TOLERANCE) {
        problems.push(`${file}: hull ${what} ${measured.toFixed(2)} m, the catalogue says ${stated} m`);
      }
    }
    if (hull.min[1] >= 0) problems.push(`${file}: the keel (${hull.min[1].toFixed(2)} m) is not below the waterline origin`);
    // Below the origin is not enough: off by a metre, the hull floats or sinks on the board (#150).
    else if (offBy(-hull.min[1], model.draftMetres) > SHIP_DIMENSION_TOLERANCE) {
      problems.push(`${file}: the keel is ${(-hull.min[1]).toFixed(2)} m under the waterline origin, the catalogue's draft is ${model.draftMetres} m`);
    }
    if (hull.max[1] <= 0) problems.push(`${file}: the deck (${hull.max[1].toFixed(2)} m) is not above the waterline origin`);
  }

  const all = glbBounds(glb);
  if (all && -all.min[2] <= all.max[2]) problems.push(`${file}: the bow does not point along −Z (it reaches further along +Z)`);
  if (all && offBy(all.max[1], model.mastheadMetres) > SHIP_DIMENSION_TOLERANCE) {
    problems.push(`${file}: masthead ${all.max[1].toFixed(2)} m above the waterline, the catalogue says ${model.mastheadMetres} m`);
  }

  return problems;
}

/** Catalogue entries without a file under `public/ships/`, and files there without an entry. */
export function catalogueFileProblems(models: Readonly<Record<ShipClass, ShipModel | null>>, files: readonly string[]): string[] {
  const listed = Object.values(models).flatMap((model) => (model ? [model.file] : []));
  return [
    ...listed.filter((file) => !files.includes(file)).map((file) => `${file} is in the catalogue but not under public/ships/`),
    ...files.filter((file) => !listed.includes(file)).map((file) => `${file} is under public/ships/ but not in the catalogue`),
  ];
}
