import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import type { MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { villageGeometryOf } from "./villageGeometry";

/**
 * The port villages' one geometry (#87), built once per map (and wrap) and
 * shared by every world copy; disposed when the map changes.
 */
export function usePortVillage(cells: readonly MapCell[], wrap: MapWrap): BufferGeometry {
  const geometry = useMemo(() => {
    const data = villageGeometryOf(cells, wrap);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(data.positions, 3));
    g.setAttribute("normal", new BufferAttribute(data.normals, 3));
    g.setAttribute("color", new BufferAttribute(data.colors, 3));
    g.computeBoundingSphere();
    return g;
  }, [cells, wrap]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}
