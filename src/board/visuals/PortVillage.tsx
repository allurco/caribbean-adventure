import { MeshStandardMaterial } from "three";
import type { PortVillageResources } from "./usePortVillage";

// White with vertex colours: walls, roofs, clutter, the town's stonework and the harbour's furniture carry their own colour.
const VILLAGE_MATERIAL = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 });

/**
 * Every port village (#87) for one world copy: its houses, clutter,
 * retaining walls and kerbs, cranes, market halls and quay flags in one draw
 * (and one shadow draw), and the cranes' swaying loads in one more (#181),
 * from the shared resources of `usePortVillage`.
 */
export function PortVillage({ village }: { village: PortVillageResources }) {
  return (
    <>
      <mesh geometry={village.geometry} material={VILLAGE_MATERIAL} castShadow receiveShadow />
      {village.loads.getAttribute("position").count > 0 && (
        <mesh geometry={village.loads} material={village.loadMaterial} customDepthMaterial={village.loadDepthMaterial} castShadow receiveShadow frustumCulled={false} />
      )}
    </>
  );
}
