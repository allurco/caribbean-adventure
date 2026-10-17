/**
 * The rules every committed town model under `public/town/` is held to
 * (PRD #392, ADR 0002 amendment (d)): the town's budget (bytes, its kind's
 * triangles and their growth over the code-built piece, no images), the vertex colour and tint channel every primitive
 * carries, the anchors its catalogue entry names, and the generator's
 * contract checked against the catalogue: the walls' footprint and the
 * height within 3 %, the origin at the ground contact under the plan
 * centre, the footing reaching down, the front along glTF +Z, nothing past
 * the plan circle. Pure; the town asset test feeds it the files.
 */
import { glbAnchors, glbAttributeValues, glbBounds, glbPartBounds, glbPartPositions, glbPrimitiveAttributes, glbTriangleSoup, glbTriangles, readGlb } from "./glb";
import { SHIP_DIMENSION_TOLERANCE } from "./shipAssetCheck";
import type { TownModel, TownPieceKind } from "./townModels";

/** Every town file's budget (PRD #392, G4: the whole kit adds at most 3 MB); the triangles are per kind, in the catalogue. */
export const TOWN_ASSET_BUDGET = { maxBytes: 250_000 } as const;

/**
 * How many more triangles a model may draw than the code-built piece it
 * replaces (#394: the tavern's budget 1,800 less the aged tavern's old
 * budget of 910), so the village's total grows by at most this per piece
 * (PRD #392, G3), whatever the flat budget leaves room for.
 */
export const TOWN_TRIANGLE_GROWTH = 890;

/** How far a measured dimension may stray from the catalogue's: the ships' figure. */
export const TOWN_DIMENSION_TOLERANCE = SHIP_DIMENSION_TOLERANCE;

/** The `_TINT` channels (PRD #392): 0 none, 1 wall, 2 roof, 3 trim, 4 shutter or awning, 5 glass. */
export const TOWN_TINT_CHANNELS = 6;

const REQUIRED_ATTRIBUTES = ["POSITION", "NORMAL", "COLOR_0", "_TINT"] as const;

const offBy = (measured: number, stated: number) => Math.abs(measured - stated) / stated;
const metres = (n: number) => `${n.toFixed(2)} m`;

/** Everything wrong with `bytes` as the model for `model`; empty when it passes. */
export function townAssetProblems(model: TownModel, bytes: Uint8Array): string[] {
  const problems: string[] = [];
  const { file } = model;
  const tolerance = TOWN_DIMENSION_TOLERANCE;
  if (bytes.byteLength > TOWN_ASSET_BUDGET.maxBytes) problems.push(`${file}: ${bytes.byteLength} bytes, over ${TOWN_ASSET_BUDGET.maxBytes}`);

  const glb = readGlb(bytes);
  const triangles = glbTriangles(glb);
  if (triangles > model.maxTriangles) problems.push(`${file}: ${triangles} triangles drawn, over ${model.maxTriangles}`);
  const growth = triangles - model.codeBuiltTriangles;
  if (growth > TOWN_TRIANGLE_GROWTH) {
    problems.push(`${file}: ${triangles} triangles drawn, ${growth} more than the code-built ${model.kind}'s ${model.codeBuiltTriangles}, over the ${TOWN_TRIANGLE_GROWTH} it may grow by`);
  }
  // Colour is the vertex colour: an image would split the village's one material (amendment (d)).
  if ((glb.json.images ?? []).length > 0) problems.push(`${file}: carries ${(glb.json.images ?? []).length} image(s); a town piece carries none`);

  glbPrimitiveAttributes(glb).forEach((names, i) => {
    for (const attribute of REQUIRED_ATTRIBUTES) {
      if (!names.includes(attribute)) problems.push(`${file}: primitive ${i} has no ${attribute}`);
    }
  });
  const stray = new Set(
    glbAttributeValues(glb, "_TINT")
      .map(([t]) => t)
      .filter((t) => !Number.isInteger(t) || t < 0 || t >= TOWN_TINT_CHANNELS)
  );
  for (const t of stray) problems.push(`${file}: tint ${t} is not one of the ${TOWN_TINT_CHANNELS} channels`);

  try {
    glbTriangleSoup(glb);
  } catch (error) {
    problems.push(`${file}: the board cannot draw it: ${error instanceof Error ? error.message : String(error)}`);
  }

  const anchors = glbAnchors(glb);
  for (const name of model.anchors) {
    if (!anchors.has(name)) problems.push(`${file}: no anchor named ${name}`);
  }

  const walls = glbPartBounds(glb).get(model.footprintPart);
  if (!walls) problems.push(`${file}: no part named ${model.footprintPart}, the footprint`);
  else {
    const width = (walls.max[0] - walls.min[0]) / 2;
    const depth = (walls.max[2] - walls.min[2]) / 2;
    if (offBy(width, model.halfWidthMetres) > tolerance) problems.push(`${file}: walls' half width ${metres(width)}, the catalogue says ${model.halfWidthMetres} m`);
    if (offBy(depth, model.halfDepthMetres) > tolerance) problems.push(`${file}: walls' half depth ${metres(depth)}, the catalogue says ${model.halfDepthMetres} m`);
    const centreX = (walls.max[0] + walls.min[0]) / 2;
    const centreZ = (walls.max[2] + walls.min[2]) / 2;
    if (Math.abs(centreX) > tolerance * model.halfWidthMetres || Math.abs(centreZ) > tolerance * model.halfDepthMetres) {
      problems.push(`${file}: the walls' plan centre is at (${metres(centreX)}, ${metres(centreZ)}), not over the origin`);
    }
    if (Math.abs(walls.min[1]) > tolerance * model.heightMetres) {
      problems.push(`${file}: the walls stand at ${metres(walls.min[1])}, not on the ground contact at the origin`);
    }
  }

  const all = glbBounds(glb);
  if (all) {
    if (offBy(all.max[1], model.heightMetres) > tolerance) problems.push(`${file}: height ${metres(all.max[1])}, the catalogue says ${model.heightMetres} m`);
    if (offBy(-all.min[1], model.footingMetres) > tolerance) problems.push(`${file}: the footing reaches ${metres(-all.min[1])} down, the catalogue says ${model.footingMetres} m`);
    if (all.max[2] <= -all.min[2]) problems.push(`${file}: the front does not face +Z (it reaches further along −Z)`);
  }
  const reach = Math.max(
    0,
    ...[...glbPartBounds(glb).keys()].flatMap((name) => glbPartPositions(glb, name).map(([x, , z]) => Math.hypot(x, z)))
  );
  if (reach > model.reachMetres) problems.push(`${file}: reaches ${metres(reach)} from the plan centre, past the layout's ${model.reachMetres} m`);

  return problems;
}

/** Catalogue entries without a file under `public/town/`, and files there without an entry. */
export function townCatalogueFileProblems(models: Readonly<Record<TownPieceKind, TownModel>>, files: readonly string[]): string[] {
  const listed = Object.values(models).map((model) => model.file);
  return [
    ...listed.filter((file) => !files.includes(file)).map((file) => `${file} is in the catalogue but not under public/town/`),
    ...files.filter((file) => !listed.includes(file)).map((file) => `${file} is under public/town/ but not in the catalogue`),
  ];
}
