import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import type { MapCell } from "../../game/types";
import type { MapWrap } from "../../game/hex";
import { PALETTE_HEX } from "./palette";
import { sharedTerrainField } from "./sharedTerrainField";
import { perMapCache } from "./perMapCache";
import { terrainSeedFromCells } from "./terrainHeightField";
import { landSurface } from "./landMesh";
import { decorationLayoutOf } from "./decorationLayout";
import { HOUSE_BOX, HOUSE_BOX_FOOTING, houseScaleBoxes } from "./houseBoxLayout";
import { HEX_METRES } from "./propScale";

/** A lime-walled box to the ridge height with a flat terracotta top; the origin at ground contact, the footing below it. */
const BOX_GEOMETRY = (() => {
  const height = HOUSE_BOX.ridge + HOUSE_BOX_FOOTING;
  const geometry = new BoxGeometry(HOUSE_BOX.w, height, HOUSE_BOX.d);
  geometry.translate(0, height / 2 - HOUSE_BOX_FOOTING, 0);
  return geometry;
})();
const WALL = new MeshStandardMaterial({ color: PALETTE_HEX.limewash, roughness: 0.9 });
const ROOF = new MeshStandardMaterial({ color: PALETTE_HEX.oldTerracotta, roughness: 0.9 });
// BoxGeometry's groups: +x, −x, +y (top), −y, +z, −z.
const MATERIALS = [WALL, WALL, ROOF, WALL, WALL, WALL];

const boxesOf = perMapCache((cells: readonly MapCell[], wrap: MapWrap) => {
  const field = sharedTerrainField(cells, wrap);
  const layout = decorationLayoutOf(cells, wrap);
  const kit = { buildings: layout.buildings, quays: layout.quays, piers: layout.piers };
  const boxes = houseScaleBoxes(cells, landSurface(field), wrap, kit, terrainSeedFromCells(cells));
  const ports = cells.filter((c) => c.hasPort).length;
  // The #84 report reads this from the console.
  console.info(`[#84] hexMetres=${HEX_METRES}: ${boxes.length} house boxes on ${ports} ports (${(boxes.length / Math.max(1, ports)).toFixed(1)} a port)`);
  return boxes;
});

const tempObject = new Object3D();

/** The #83/#84 prototypes' real-size house boxes on every port hex (one instanced draw per world copy). */
export function HouseScaleBoxes({ cells, wrap }: { cells: readonly MapCell[]; wrap: MapWrap }) {
  const boxes = useMemo(() => boxesOf(cells, wrap), [cells, wrap]);
  const meshRef = useRef<InstancedMesh>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    boxes.forEach((b, i) => {
      tempObject.position.set(b.worldX, b.worldY, b.worldZ);
      tempObject.rotation.set(0, b.yaw, 0);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [boxes]);
  if (boxes.length === 0) return null;
  return (
    <instancedMesh
      key={boxes.length}
      ref={meshRef}
      args={[BOX_GEOMETRY, MATERIALS, boxes.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}
