import { MeshStandardMaterial, type BufferGeometry } from "three";

// White with vertex colours: walls, roofs, clutter and the town's stonework carry their own colour.
const VILLAGE_MATERIAL = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 });

/**
 * Every port village (#87) for one world copy: its houses, clutter,
 * retaining walls and kerbs in one draw (and one shadow draw), from the
 * shared geometry of `usePortVillage`.
 */
export function PortVillage({ geometry }: { geometry: BufferGeometry }) {
  return <mesh geometry={geometry} material={VILLAGE_MATERIAL} castShadow receiveShadow />;
}
