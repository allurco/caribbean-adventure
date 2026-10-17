import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, MeshDepthMaterial, MeshStandardMaterial } from "three";
import type { MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";
import type { FacetGeometryData } from "./facetBuilder";
import { injectCraneSway } from "./craneSway";
import type { SwayClock } from "./useSwayClock";
import { villageGeometryOf } from "./villageGeometry";

/** The village layer's GPU resources: the one soup, and the cranes' loads with the materials that swing them (#181). */
export interface PortVillageResources {
  geometry: BufferGeometry;
  loads: BufferGeometry;
  loadMaterial: MeshStandardMaterial;
  loadDepthMaterial: MeshDepthMaterial;
}

function toGeometry(data: FacetGeometryData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(data.positions, 3));
  g.setAttribute("normal", new BufferAttribute(data.normals, 3));
  g.setAttribute("color", new BufferAttribute(data.colors, 3));
  g.computeBoundingSphere();
  return g;
}

/** The loads' materials, swung by the board's one sway clock: still under reduced motion (`useSwayClock.ts`). */
function createLoadMaterials(clock: SwayClock) {
  const loadMaterial = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 });
  loadMaterial.onBeforeCompile = (shader) => {
    injectCraneSway(shader, clock.angle);
  };
  loadMaterial.customProgramCacheKey = () => "crane-sway";
  // Shadows swing with the loads.
  const loadDepthMaterial = new MeshDepthMaterial();
  loadDepthMaterial.onBeforeCompile = (shader) => {
    injectCraneSway(shader, clock.angle);
  };
  loadDepthMaterial.customProgramCacheKey = () => "crane-sway-depth";
  return { loadMaterial, loadDepthMaterial };
}

/**
 * The port villages' geometry (#87) and the cranes' loads (#181), built once
 * per map (and wrap and world seed) and shared by every world copy; disposed
 * when the map changes.
 */
export function usePortVillage(cells: readonly MapCell[], wrap: MapWrap, worldSeed: number, clock: SwayClock): PortVillageResources {
  const geometries = useMemo(() => {
    const meshes = villageGeometryOf(cells, wrap, worldSeed);
    const loads = toGeometry(meshes.loads);
    loads.setAttribute("swayPivot", new BufferAttribute(meshes.loads.pivots, 3));
    loads.setAttribute("swayPhase", new BufferAttribute(meshes.loads.phases, 1));
    return { geometry: toGeometry(meshes.village), loads };
  }, [cells, wrap, worldSeed]);
  const materials = useMemo(() => createLoadMaterials(clock), [clock]);
  useEffect(
    () => () => {
      geometries.geometry.dispose();
      geometries.loads.dispose();
    },
    [geometries]
  );
  useEffect(
    () => () => {
      materials.loadMaterial.dispose();
      materials.loadDepthMaterial.dispose();
    },
    [materials]
  );
  return useMemo(() => ({ ...geometries, ...materials }), [geometries, materials]);
}
