/** The shrubs' shared geometry and materials, built once per map (#49). */
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  MeshDepthMaterial,
  MeshStandardMaterial,
} from "three";
import { injectPalmSway } from "./palmSway";
import { buildShrubGeometry, SHRUB_KINDS, type Rgb, type ShrubKind } from "./shrubGeometry";
import { SHRUB_COLOR_HEX, shrubVariation, type ShrubPlacement } from "./shrubVariation";
import type { SwayClock } from "./useSwayClock";

const rgb = (hex: number): Rgb => {
  const c = new Color(hex); // sRGB hex into the linear working space
  return [c.r, c.g, c.b];
};

// One set of triangles per kind, shared by every instance.
const SHRUB_DATA = Object.fromEntries(
  SHRUB_KINDS.map((kind) => [
    kind,
    buildShrubGeometry(kind, { stem: rgb(SHRUB_COLOR_HEX[kind].stem), foliage: rgb(SHRUB_COLOR_HEX[kind].foliage) }),
  ])
) as Record<ShrubKind, ReturnType<typeof buildShrubGeometry>>;

function createShrubGeometry(kind: ShrubKind, shrubs: readonly ShrubPlacement[]): BufferGeometry {
  const data = SHRUB_DATA[kind];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(data.colors, 3));
  geometry.setAttribute("palm", new BufferAttribute(data.palm, 2));
  // (sway phase, crown twist): shrubs have no crown, so the twist stays 0.
  const instance = new InstancedBufferAttribute(new Float32Array(shrubs.length * 2), 2);
  shrubs.forEach((shrub, i) => instance.setXY(i, shrubVariation(shrub).phase, 0));
  geometry.setAttribute("palmInstance", instance);
  return geometry;
}

function createShrubMaterials(clock: SwayClock) {
  // Vertex colours carry the stem/foliage shading; `instanceColor` tints them per shrub.
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    side: DoubleSide, // Blades are single sheets
    roughness: 0.9,
  });
  material.onBeforeCompile = (shader) => {
    injectPalmSway(shader, clock.angle);
  };
  material.customProgramCacheKey = () => "palm-sway";

  // Shadows use the same displacement, so they sway with the shrubs.
  const depthMaterial = new MeshDepthMaterial();
  depthMaterial.onBeforeCompile = (shader) => {
    injectPalmSway(shader, clock.angle);
  };
  depthMaterial.customProgramCacheKey = () => "palm-sway-depth";

  return { material, depthMaterial };
}

/** One kind's placements and geometry. */
export interface ShrubKindResources {
  kind: ShrubKind;
  shrubs: ShrubPlacement[];
  geometry: BufferGeometry;
}

/** The shrubs' shared geometry and materials, built once per map. */
export interface ShrubsResources {
  kinds: ShrubKindResources[];
  material: MeshStandardMaterial;
  depthMaterial: MeshDepthMaterial;
}

/**
 * Builds the shrub geometry and materials once per map, split by kind, with
 * the per-instance sway phase filled in. The sway angle comes from the
 * shared clock, so shrubs and palms move to the same wind.
 */
export function useShrubs(shrubs: ShrubPlacement[], clock: SwayClock): ShrubsResources {
  const { material, depthMaterial } = useMemo(() => createShrubMaterials(clock), [clock]);
  useEffect(
    () => () => {
      material.dispose();
      depthMaterial.dispose();
    },
    [material, depthMaterial]
  );

  const kinds = useMemo(
    () =>
      SHRUB_KINDS.map((kind): ShrubKindResources => {
        const ofKind = shrubs.filter((s) => s.kind === kind);
        return { kind, shrubs: ofKind, geometry: createShrubGeometry(kind, ofKind) };
      }),
    [shrubs]
  );
  useEffect(() => () => kinds.forEach((k) => k.geometry.dispose()), [kinds]);

  return useMemo(() => ({ kinds, material, depthMaterial }), [kinds, material, depthMaterial]);
}
