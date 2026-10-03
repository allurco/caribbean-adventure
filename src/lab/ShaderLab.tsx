import { Canvas, useFrame } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { useRef, useState } from "react";
import * as THREE from "three";
import vertexShader from "./water.vert?raw";
import fragmentShader from "./water.frag?raw";

/**
 * A single rectangle that fills the screen, painted entirely by water.frag.
 * The material is keyed on the shader source, so editing the .vert / .frag
 * files remounts and recompiles it without a manual refresh.
 */
function FullscreenShader() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [uniforms] = useState(() => ({ uTime: { value: 0 } }));

  // Advance the clock every frame and feed it to the shader.
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        key={vertexShader + fragmentShader}
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
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
