import { Suspense, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { sceneModelUrls } from "./sceneAssets";

/** Loads one ship model through the cache Ship.tsx draws from, and reports it once it is in. */
function ModelLoaded({ url, complete }: { url: string; complete: (id: string) => void }) {
  useGLTF(url, false, false);
  useEffect(() => complete(`model:${url}`), [url, complete]);
  return null;
}

/**
 * The loading gate's eyes inside the Canvas (useSceneReadiness.ts): waits on
 * every ship model, compiles every shader in the scene once the gate asks
 * (every asset in, the world built and the sky baked, so the sea is there to
 * compile), then counts the frames drawn after it. Draws nothing.
 */
export function SceneReadinessProbe({
  compileShaders,
  countFrames,
  complete,
  frame,
}: {
  compileShaders: boolean;
  countFrames: boolean;
  complete: (id: string) => void;
  frame: () => void;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    if (!compileShaders) return;
    let live = true;
    // Where KHR_parallel_shader_compile is missing compileAsync still compiles, only not in parallel
    gl.compileAsync(scene, camera)
      .catch((error: unknown) => console.warn("[loading] shader compile failed", error))
      .finally(() => {
        if (live) complete("shaders");
      });
    return () => {
      live = false;
    };
  }, [compileShaders, gl, scene, camera, complete]);

  // The frames after the compile: the post-processing passes, the seabed and
  // the wave cascades compile on their first draw, so these are not instant.
  useFrame(() => {
    if (countFrames) frame();
  });

  return (
    <>
      {sceneModelUrls(import.meta.env.BASE_URL).map((url) => (
        <Suspense key={url} fallback={null}>
          <ModelLoaded url={url} complete={complete} />
        </Suspense>
      ))}
    </>
  );
}
