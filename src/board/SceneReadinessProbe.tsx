import { Suspense, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { ErrorBoundary } from "react-error-boundary";
import { ShipModelMesh } from "./Ship";
import { SHIP_FLAGS } from "./shipFlags";
import { SHIP_MODELS, shipModelUrl, type ShipModel } from "./shipModels";

/** Far below the sea, where the warm-up ships are never seen (and culled), but still compiled. */
const WARM_UP_DEPTH = -1000;
const noHeading = () => 0;
/** Every class's model, once each. */
const MODELS = [...new Set(Object.values(SHIP_MODELS).flatMap((model) => (model ? [model] : [])))];

/**
 * Loads one ship model through the cache Ship.tsx draws from and reports it
 * once it is in; until the shaders are compiled it keeps one dressed copy in
 * the scene, out of sight, so its materials compile with the rest.
 */
function ModelLoaded({ model, url, warm, complete }: { model: ShipModel; url: string; warm: boolean; complete: (id: string) => void }) {
  useGLTF(url, false, false);
  useEffect(() => complete(`model:${url}`), [url, complete]);
  if (!warm) return null;
  return (
    <group position-y={WARM_UP_DEPTH}>
      <ShipModelMesh model={model} colour="#888888" flag={SHIP_FLAGS[0]} heading={noHeading} />
    </group>
  );
}

/**
 * The loading gate's eyes inside the Canvas (useSceneReadiness.ts): waits on
 * every ship model (a model that fails is reported failed, not waited on),
 * compiles every shader in the scene once the gate asks
 * (every asset in, the world built and the sky baked, so the sea is there to
 * compile), then counts the frames drawn after it. Draws nothing.
 */
export function SceneReadinessProbe({
  compileShaders,
  shadersCompiled,
  countFrames,
  complete,
  fail,
  frame,
}: {
  compileShaders: boolean;
  shadersCompiled: boolean;
  countFrames: boolean;
  complete: (id: string) => void;
  fail: (id: string, error: unknown) => void;
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
      {MODELS.map((model) => {
        const url = shipModelUrl(model, import.meta.env.BASE_URL);
        return (
          <ErrorBoundary key={url} fallback={null} onError={(error) => fail(`model:${url}`, error)}>
            <Suspense fallback={null}>
              <ModelLoaded model={model} url={url} warm={!shadersCompiled} complete={complete} />
            </Suspense>
          </ErrorBoundary>
        );
      })}
    </>
  );
}
