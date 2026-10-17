import { Suspense, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { ErrorBoundary } from "react-error-boundary";
import { WebGLRenderTarget } from "three";
import { ShipModelMesh } from "./Ship";
import { SHIP_FLAGS } from "./shipFlags";
import { DEFAULT_HULL_BOX } from "./shipHull";
import { SHIP_MODELS, shipModelUrl, type ShipModel } from "./shipModels";
import { compileForFrames, type FrameOutput } from "./shaderWarmUp";

const noHeading = () => 0;
/**
 * The opacity the fading keepers are held at (#135): below 1, so their
 * materials are the transparent variants a sinking ship fades through.
 */
const FADING: { readonly current: number } = { current: 0.5 };
/** Every class's model, once each. */
const MODELS = [...new Set(Object.values(SHIP_MODELS).flatMap((model) => (model ? [model] : [])))];

/**
 * Loads one ship model through the cache Ship.tsx draws from, reports it
 * once it is in, and keeps two hidden copies of it for the shader compile
 * (which compiles hidden meshes too; they are never drawn):
 * - the warm-up copy, afloat, only until the shaders are compiled (`warm`);
 * - the fading keeper (#135), for good: its transparent materials compile
 *   with the rest and, never disposed, keep those programs alive, so a ship
 *   that sinks and fades compiles nothing, however many sink.
 */
function ShipModelKeepers({ model, url, warm, complete }: { model: ShipModel; url: string; warm: boolean; complete: (id: string) => void }) {
  useGLTF(url, false, false);
  useEffect(() => complete(`model:${url}`), [url, complete]);
  return (
    <group visible={false}>
      {warm && <ShipModelMesh model={model} colour="#888888" flag={SHIP_FLAGS[0]} heading={noHeading} />}
      <ShipModelMesh model={model} colour="#888888" flag={SHIP_FLAGS[0]} heading={noHeading} sinking fade={FADING} />
    </group>
  );
}

/**
 * The box a sinking ship with no model (or whose model failed) goes down as,
 * kept hidden for good like the models' fading keepers, in both its looks:
 * opaque as she starts to sink, transparent as she fades. Both variants
 * compile at load and stay.
 */
function BoxKeepers() {
  return (
    <group visible={false}>
      <mesh castShadow>
        <boxGeometry args={[...DEFAULT_HULL_BOX]} />
        <meshStandardMaterial />
      </mesh>
      <mesh castShadow>
        <boxGeometry args={[...DEFAULT_HULL_BOX]} />
        <meshStandardMaterial transparent opacity={FADING.current} />
      </mesh>
    </group>
  );
}

/** A render target to compile into, as the composer's are drawn into: any size does, a program depends only on there being one. */
const warmUpTarget = () => new WebGLRenderTarget(1, 1);

/**
 * The loading gate's eyes inside the Canvas (useSceneReadiness.ts): waits on
 * every ship model (a model that fails is reported failed, not waited on),
 * compiles every shader in the scene once the gate asks
 * (every asset in, the world built and the sky baked, so the sea is there to
 * compile), into the kind of target the frames are drawn to (`frameOutput`,
 * shaderWarmUp.ts), then counts the frames drawn after it. Draws nothing.
 */
export function SceneReadinessProbe({
  compileShaders,
  frameOutput,
  shadersCompiled,
  countFrames,
  complete,
  fail,
  frame,
}: {
  compileShaders: boolean;
  /** Where the frames are drawn: through the post-processing composer, or straight to the screen. */
  frameOutput: FrameOutput;
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
    compileForFrames(gl, () => gl.compileAsync(scene, camera), frameOutput, warmUpTarget)
      .catch((error: unknown) => console.warn("[loading] shader compile failed", error))
      .finally(() => {
        if (live) complete("shaders");
      });
    return () => {
      live = false;
    };
  }, [compileShaders, frameOutput, gl, scene, camera, complete]);

  // The frames after the compile: the post-processing passes, the seabed and
  // the wave cascades compile on their first draw, so these are not instant.
  useFrame(() => {
    if (countFrames) frame();
  });

  return (
    <>
      <BoxKeepers />
      {MODELS.map((model) => {
        const url = shipModelUrl(model, import.meta.env.BASE_URL);
        return (
          <ErrorBoundary key={url} fallback={null} onError={(error) => fail(`model:${url}`, error)}>
            <Suspense fallback={null}>
              <ShipModelKeepers model={model} url={url} warm={!shadersCompiled} complete={complete} />
            </Suspense>
          </ErrorBoundary>
        );
      })}
    </>
  );
}
