/**
 * A town model's bytes as the geometry the board draws (#394): every
 * triangle unindexed, in the code-built pieces' local frame at scale 1
 * (metres to units, `TOWN_MODEL_UNITS_PER_METRE`), with its baked vertex
 * colours. The layout's transforms (position, yaw, the scale that carries
 * the family factor) and its per-instance tint then apply to it unchanged,
 * as they do to the code-built piece it replaces. Pure, no Three.js: read
 * with `glb.ts`.
 */
import type { FacetGeometryData } from "./visuals/facetBuilder";
import { glbTriangleSoup, readGlb } from "./glb";
import { TOWN_MODEL_UNITS_PER_METRE } from "./townModels";

export function townModelGeometry(bytes: Uint8Array): FacetGeometryData {
  const soup = glbTriangleSoup(readGlb(bytes));
  const positions = soup.positions.map((v) => v * TOWN_MODEL_UNITS_PER_METRE);
  return { positions, normals: soup.normals, colors: soup.colors, vertexCount: soup.vertexCount };
}
