/** The palms' shared geometry and materials, built once per map (#36); the sway clock is shared (`useSwayClock`). */
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  MeshDepthMaterial,
  MeshStandardMaterial,
} from "three";
import { paletteColor } from "./palette";
import { buildPalmGeometry, type Rgb } from "./palmGeometry";
import { palmVariation, type PalmPlacement } from "./palmVariation";
import { injectPalmSway } from "./palmSway";
import type { SwayClock } from "./useSwayClock";

const rgb = (name: "palmTrunk" | "palmFrond"): Rgb => {
  const c = paletteColor(name);
  return [c.r, c.g, c.b];
};

// One palm's triangles, shared by every instance.
const PALM_DATA = buildPalmGeometry({ trunk: rgb("palmTrunk"), frond: rgb("palmFrond") });

function createPalmGeometry(count: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(PALM_DATA.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(PALM_DATA.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(PALM_DATA.colors, 3));
  geometry.setAttribute("palm", new BufferAttribute(PALM_DATA.palm, 2));
  geometry.setAttribute("palmInstance", new InstancedBufferAttribute(new Float32Array(count * 2), 2));
  return geometry;
}

/** Palm materials bound to the shared sway clock's angle uniform. */
function createPalmMaterials(clock: SwayClock) {
  // Flat shading takes facet normals from the displaced surface, so lighting
  // follows the sway and the per-instance height stretch.
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    side: DoubleSide, // Fronds are single sheets
  });
  material.onBeforeCompile = (shader) => {
    injectPalmSway(shader, clock.angle);
  };
  material.customProgramCacheKey = () => "palm-sway";

  // Shadows use the same displacement, so they sway with the palms.
  const depthMaterial = new MeshDepthMaterial();
  depthMaterial.onBeforeCompile = (shader) => {
    injectPalmSway(shader, clock.angle);
  };
  depthMaterial.customProgramCacheKey = () => "palm-sway-depth";

  return { material, depthMaterial };
}

/** The palms' shared geometry and materials, built once per map. */
export interface PalmTreesResources {
  palms: PalmPlacement[];
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  depthMaterial: MeshDepthMaterial;
}

/**
 * Builds the palm geometry and materials once per map and fills the
 * per-instance sway data. The sway angle comes from the shared clock, which
 * advances once per frame for every world copy that draws them.
 */
export function usePalmTrees(palms: PalmPlacement[], clock: SwayClock): PalmTreesResources {
  const { material, depthMaterial } = useMemo(() => createPalmMaterials(clock), [clock]);
  useEffect(
    () => () => {
      material.dispose();
      depthMaterial.dispose();
    },
    [material, depthMaterial]
  );

  const geometry = useMemo(() => {
    const g = createPalmGeometry(palms.length);
    const instance = g.getAttribute("palmInstance") as InstancedBufferAttribute;
    palms.forEach((palm, i) => {
      const v = palmVariation(palm);
      instance.setXY(i, v.phase, v.crownTwist);
    });
    return g;
  }, [palms]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return useMemo(() => ({ palms, geometry, material, depthMaterial }), [palms, geometry, material, depthMaterial]);
}

