/** The palms' shared geometry, materials and sway, built once per map (#36). */
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
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
import { advanceSwayAngle, injectPalmSway } from "./palmSway";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

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

interface SwayUniform {
  value: number;
}

/** The sway angle uniform shared by a palm material and its depth material. */
const swayUniformOf = (material: MeshStandardMaterial): SwayUniform =>
  material.userData.palmSwayAngle as SwayUniform;

function createPalmMaterials() {
  const angle: SwayUniform = { value: 0 };

  // Flat shading takes facet normals from the displaced surface, so lighting
  // follows the sway and the per-instance height stretch.
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    side: DoubleSide, // Fronds are single sheets
  });
  material.onBeforeCompile = (shader) => {
    injectPalmSway(shader, angle);
  };
  material.customProgramCacheKey = () => "palm-sway";
  material.userData.palmSwayAngle = angle;

  // Shadows use the same displacement, so they sway with the palms.
  const depthMaterial = new MeshDepthMaterial();
  depthMaterial.onBeforeCompile = (shader) => {
    injectPalmSway(shader, angle);
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
 * Builds the palm geometry and materials once per map, fills the
 * per-instance sway data, and advances the sway once per frame for every
 * world copy that draws them.
 */
export function usePalmTrees(palms: PalmPlacement[]): PalmTreesResources {
  const reducedMotion = usePrefersReducedMotion();

  const { material, depthMaterial } = useMemo(() => createPalmMaterials(), []);
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

  useFrame((_, delta) => {
    const angle = swayUniformOf(material);
    angle.value = advanceSwayAngle(angle.value, delta, reducedMotion);
  });

  return useMemo(() => ({ palms, geometry, material, depthMaterial }), [palms, geometry, material, depthMaterial]);
}

