/**
 * Loads a town model's bytes and reads them into the geometry the board
 * draws (#394), suspending until they are in. One cache for every caller:
 * the readiness probe that waits on the file, `PortBuildings.tsx` that
 * draws it, and the prop viewer. The bytes are read with the pure `glb.ts`
 * (`townModelGeometry.ts`), once per file, never with three's glTF loader:
 * the town's pieces are plain coloured triangles, and the village merge
 * that comes next (#392) wants them as arrays, not as a scene.
 */
import { useLoader } from "@react-three/fiber";
import { FileLoader } from "three";
import type { FacetGeometryData } from "./visuals/facetBuilder";
import { townModelGeometry } from "./townModelGeometry";
import { townModelUrl, type TownModel } from "./townModels";

/** Our own loader, so the arraybuffer response type never leaks to another FileLoader user. */
const BYTES = new FileLoader().setResponseType("arraybuffer");

const geometries = new WeakMap<ArrayBuffer, FacetGeometryData>();

export const townModelFileUrl = (model: TownModel): string => townModelUrl(model, import.meta.env.BASE_URL);

/** The model's geometry, in the code-built piece's frame; suspends while it loads, throws if it fails. */
export function useTownModelGeometry(model: TownModel): FacetGeometryData {
  const data = useLoader(BYTES, townModelFileUrl(model));
  if (!(data instanceof ArrayBuffer)) throw new Error(`${model.file} did not load as bytes`);
  let geometry = geometries.get(data);
  if (!geometry) {
    geometry = townModelGeometry(new Uint8Array(data));
    geometries.set(data, geometry);
  }
  return geometry;
}
