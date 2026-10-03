import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Object3D,
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

const tempObject = new Object3D();
tempObject.rotation.order = "YXZ"; // Lean in local space first, then yaw

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
const swayUniformOf = (mesh: InstancedMesh): SwayUniform =>
  (mesh.material as MeshStandardMaterial).userData.palmSwayAngle as SwayUniform;

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

interface PalmTreesProps {
  palms: PalmPlacement[];
}

/** Every palm on the map in one instanced draw, swaying in the vertex shader. */
export function PalmTrees({ palms }: PalmTreesProps) {
  const reducedMotion = usePrefersReducedMotion();

  const { material, depthMaterial } = useMemo(() => createPalmMaterials(), []);
  useEffect(
    () => () => {
      material.dispose();
      depthMaterial.dispose();
    },
    [material, depthMaterial]
  );

  const geometry = useMemo(() => createPalmGeometry(palms.length), [palms.length]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const meshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const instance = geometry.getAttribute("palmInstance") as InstancedBufferAttribute;
    palms.forEach((palm, i) => {
      const v = palmVariation(palm);
      tempObject.position.set(palm.worldX, palm.worldY, palm.worldZ);
      // The trunk curves towards local +X; a negative Z turn tips it further that way.
      tempObject.rotation.set(0, v.yaw, -v.lean);
      tempObject.scale.set(palm.scale, palm.scale * v.heightScale, palm.scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
      instance.setXY(i, v.phase, v.crownTwist);
    });
    mesh.instanceMatrix.needsUpdate = true;
    instance.needsUpdate = true;
  }, [palms, geometry]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const angle = swayUniformOf(meshRef.current);
    angle.value = advanceSwayAngle(angle.value, delta, reducedMotion);
  });

  if (palms.length === 0) return null;

  return (
    <instancedMesh
      // Remount when the count changes: an InstancedMesh's capacity is fixed.
      key={palms.length}
      ref={meshRef}
      args={[geometry, material, palms.length]}
      customDepthMaterial={depthMaterial}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}
