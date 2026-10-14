import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Matrix4, type InstancedMesh } from "three";
import { controlsTarget } from "../controlsTarget";
import { buoyGrid } from "./buoyGrid";
import { useSeaSurface } from "./seaSurfaceContext";

/** Buoys per side of the square. */
const BUOY_COUNT = 9;
/** World units between buoys (about 33 m). */
const BUOY_SPACING = 0.5;
/** Buoy radius, world units (about 3 m): centred on the surface, half of it shows. */
const BUOY_RADIUS = 0.05;

/**
 * Dev only (#141, `?buoys=1`): small spheres centred on the CPU sea surface
 * on a grid round the camera focus, to check by eye that it sits on the
 * drawn water. Reads the scene's sea surface (SeaSurfaceContext), the one the
 * ships ride, after the wave clock (useWaveClock) in the frame.
 */
export function SeaBuoys() {
  const controls = useThree((s) => s.controls);
  const sea = useSeaSurface();
  const meshRef = useRef<InstancedMesh>(null);
  const matrix = useMemo(() => new Matrix4(), []);

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    const focus = controlsTarget(controls);
    if (!mesh || !focus || !sea) return;
    const { clock, surface } = sea;
    const seconds = clock.waveTimeAt();
    const eye: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    buoyGrid(focus, BUOY_COUNT, BUOY_SPACING).forEach(([x, z], i) => {
      matrix.makeTranslation(x, surface.heightAt(x, z, seconds, eye), z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, BUOY_COUNT * BUOY_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[BUOY_RADIUS, 12, 8]} />
      <meshStandardMaterial color="#ff5a1f" roughness={0.6} />
    </instancedMesh>
  );
}
