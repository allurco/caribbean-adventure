import { Canvas, useFrame } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import vertexShader from "./water.vert?raw";
import fragmentShader from "./water.frag?raw";

/**
 * A single rectangle that fills the screen, painted entirely by water.frag.
 * The material is rebuilt whenever the shader source changes, so editing the
 * .vert / .frag files hot-reloads the picture without a manual refresh.
 */
function FullscreenShader() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
        },
      }),
    // Rebuild the material when either shader's source changes, so saving a
    // .frag / .vert edit recompiles and repaints without a full page reload.
    [vertexShader, fragmentShader],
  );

  // Advance the clock every frame and feed it to the shader.
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * The shader lab route. Open http://localhost:5173/#lab to see it.
 * Everything here is harness — your work happens in water.frag.
 */
export function ShaderLab() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas>
        <FullscreenShader />
        <Stats />
      </Canvas>

      <div className="pointer-events-none absolute bottom-4 left-4 max-w-sm rounded-lg bg-black/50 p-3 text-xs leading-relaxed text-white/80 backdrop-blur">
        <div className="mb-1 font-semibold text-white">Shader Lab · rung 1</div>
        Editing <code className="text-cyan-300">src/lab/water.frag</code>. Change
        a number, predict what you&rsquo;ll see, then save. The counter
        (top-left) is your honesty meter — watch the FPS.
      </div>
    </div>
  );
}
