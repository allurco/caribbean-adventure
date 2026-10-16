import { use, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EventDispatcher, PerspectiveCamera, Vector3, type Camera, type WebGLRenderer } from "three";
import { ErrorBoundary } from "react-error-boundary";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { CAMERA_FOV } from "../cameraBounds";
import { SCENE_LIGHTING } from "../visuals/sceneLighting";
import { sunShadowFor } from "../visuals/atmosphere";
import { SunLight } from "../visuals/SunLight";
import { FillLight } from "../visuals/FillLight";
import { Ocean } from "../visuals/Ocean";
import { LandTerrain } from "../visuals/LandTerrain";
import { TerrainDecorations } from "../visuals/TerrainDecorations";
import { PlainRender } from "../visuals/PlainRender";
import { useSkyEnvironment } from "../visuals/useSkyEnvironment";
import { useWaveClock } from "../visuals/useWaveClock";
import { useWaveCascades } from "../visuals/useWaveCascades";
import { useTerrainFieldTexture } from "../visuals/useTerrainFieldTexture";
import { useLandTerrain } from "../visuals/useLandTerrain";
import { useDecorationLayout } from "../visuals/useDecorationLayout";
import { WAVE_CASCADES, WHITECAP_CASCADES } from "../visuals/oceanWaves";
import { DISPLACEMENT_CASCADES } from "../visuals/waveDisplacement";
import { createFramePacer, HARBOUR_FPS } from "./framePacer";
import { useRotateGateShowing } from "../../landscape/useRotateGateShowing";
import { isSettled, settleStep, shouldCompile, UNSETTLED } from "./harbourSettle";
import { harbourCamera, harbourFov, type Vec3 } from "./harbourView";
import { MotionHeldContext } from "../visuals/motionHold";
import { surfTimeUniform } from "../visuals/surfMotion";
import { harbourWorldOnce, holdHarbourWorld, type HarbourWorld } from "./harbourWorld";

export interface HarbourSceneProps {
  /** The waves, the surf and the palms run; until then they are held at the moment the still was captured at (motionHold.ts). Frozen anyway under reduced motion. */
  wavesRunning: boolean;
  /** The scene has drawn a settled frame (harbourSettle.ts): once. */
  onSettled: () => void;
  /** The scene cannot run: no WebGL, a lost context, an error. */
  onFailed: (error: unknown) => void;
}

/**
 * The live harbour behind the online shell (#122): the board's sea, land,
 * decorations and light on a fixed map (harbourView.ts), lightened to be a
 * backdrop. Device pixel ratio 1, no shadow maps, no post-processing (the
 * board's tone mapping is the renderer's, its vignette is CSS), a fixed
 * camera, frames on demand at about 30 fps (framePacer.ts), and none at all
 * once settled under reduced motion. Suspends while the map is generated in
 * the map worker.
 */
export function HarbourScene(props: HarbourSceneProps) {
  const pending = harbourWorldOnce();
  const world = use(pending);
  // Let the world (and every per-map cache on its map) go once the scene is gone
  useEffect(() => holdHarbourWorld(pending), [pending]);
  const { onFailed } = props;
  const view = useMemo(() => harbourCamera(world.target), [world.target]);
  // R3F forces the context lost when the canvas unmounts: that is leaving, not failing
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const onContextLost = useCallback(
    (event: Event) => {
      if (mounted.current) onFailed(event);
    },
    [onFailed]
  );
  return (
    <ErrorBoundary fallback={null} onError={onFailed}>
      <Canvas
        frameloop="demand"
        dpr={1}
        shadows={false}
        gl={{ antialias: true, powerPreference: "low-power" }}
        camera={{ fov: CAMERA_FOV, near: view.near, far: 1000, position: view.position }}
        onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", onContextLost, { once: true })}
        style={{ position: "absolute", inset: 0 }}
      >
        <MotionHeldContext value={!props.wavesRunning}>
          <Harbour world={world} {...props} />
        </MotionHeldContext>
      </Canvas>
    </ErrorBoundary>
  );
}

function Harbour({ world, wavesRunning, onSettled }: HarbourSceneProps & { world: HarbourWorld }) {
  const { cells, wrap, seed, target } = world;
  const lighting = SCENE_LIGHTING;
  const sunShadow = useMemo(() => sunShadowFor(lighting.sun), [lighting.sun]);
  const reducedMotion = usePrefersReducedMotion();
  const frozen = reducedMotion || !wavesRunning;
  // No frames at all under the rotate gate (#123), which covers the backdrop with its own still
  const gated = useRotateGateShowing();

  const sky = useSkyEnvironment(lighting);
  const waveClock = useWaveClock(frozen);
  const waves = useWaveCascades(WAVE_CASCADES, WHITECAP_CASCADES, DISPLACEMENT_CASCADES, waveClock);
  const terrainField = useTerrainFieldTexture(cells, wrap, seed);
  const land = useLandTerrain(cells, wrap, seed, { sun: lighting.sun.direction, waveSlopes: waves.slopes, terrainField });
  const decorations = useDecorationLayout(cells, wrap, seed);

  const settled = useSettledSignal(sky !== null, onSettled);
  // The surf clock is shared module state (surfMotion.ts): start it from the still's moment, as the scene's own wave and sway clocks do
  useEffect(() => {
    surfTimeUniform.value = 0;
  }, []);

  return (
    <>
      <FixedView target={target} />
      <ToneExposure exposure={lighting.grade.exposure} />
      <Pacer running={(!settled || !frozen) && !gated} />

      <color attach="background" args={[lighting.haze.color]} />
      <fog attach="fog" args={[lighting.haze.color, lighting.haze.near, lighting.haze.far]} />
      <SunLight sun={lighting.sun} shadow={sunShadow} />
      <FillLight fill={lighting.fill} />
      <hemisphereLight color={lighting.ambient.skyColor} groundColor={lighting.ambient.groundColor} intensity={lighting.ambient.intensity} />

      {sky && (
        <Ocean
          terrainField={terrainField}
          sun={lighting.sun.direction}
          sunColor={lighting.sun.color}
          sunIntensity={lighting.sun.intensity}
          light={lighting.ocean}
          sky={sky.texture}
          skyHeight={sky.textureHeight}
          skyIntensity={sky.intensity}
          waveSlopes={waves.slopes}
          waveWhitecaps={waves.whitecaps}
          waveDisplacements={waves.displacements}
        />
      )}
      <LandTerrain terrain={land} />
      <TerrainDecorations layout={decorations} waveSlopes={waves.slopes} />

      {/* No composer: the frame goes straight to the screen (the sea's prepasses take R3F's own render away) */}
      <PlainRender />
    </>
  );
}

/**
 * Tracks the scene to its settled frame (harbourSettle.ts) and reports it
 * once: the world is built when this first commits (children commit before
 * their parent's effects), the sky when `skyBaked`; then the shaders are
 * compiled and a run of frames drawn. Returns whether it has settled.
 */
function useSettledSignal(skyBaked: boolean, onSettled: () => void): boolean {
  const [state, step] = useReducer(settleStep, UNSETTLED);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const settled = isSettled(state);
  const compile = shouldCompile(state);

  useEffect(() => step("world"), []);
  useEffect(() => {
    if (skyBaked) step("sky");
  }, [skyBaked]);
  useEffect(() => {
    if (!compile) return;
    let live = true;
    // Where KHR_parallel_shader_compile is missing compileAsync still compiles, only not in parallel
    gl.compileAsync(scene, camera)
      .catch((error: unknown) => console.warn("[harbour] shader compile failed", error))
      .finally(() => {
        if (!live) return;
        step("compiled");
        invalidate();
      });
    return () => {
      live = false;
    };
  }, [compile, gl, scene, camera, invalidate]);

  useFrame(() => {
    if (!settled) step("frame");
  });

  const reported = useRef(false);
  useEffect(() => {
    if (!settled || reported.current) return;
    reported.current = true;
    onSettled();
  }, [settled, onSettled]);
  return settled;
}

/**
 * The fixed camera (harbourView.ts): placed once, its field of view following
 * the viewport's aspect so the still lines up at any size. It stands in for
 * the board's map controls as the scene's focus, which the sea's grid, the
 * lights and the shore foam follow.
 */
function FixedView({ target }: { target: Vec3 }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const set = useThree((s) => s.set);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const view = harbourCamera(target);
    camera.position.set(...view.position);
    camera.lookAt(...view.target);
    camera.updateMatrixWorld();
    set({ controls: fixedFocus(view.target) });
    invalidate();
  }, [camera, target, set, invalidate]);

  useEffect(() => {
    if (size.height <= 0) return;
    fitFov(camera, size.width / size.height);
    invalidate();
  }, [camera, size, invalidate]);
  return null;
}

/**
 * A stand-in for map controls that never move: what the scene reads from
 * R3F's `controls` is an event dispatcher with a `target`, the camera's focus.
 */
function fixedFocus(target: Vec3): EventDispatcher & { target: Vector3 } {
  return Object.assign(new EventDispatcher(), { target: new Vector3(...target) });
}

/** The board's exposure under the renderer's ACES tone mapping, which stands in for the composer's pass here. */
function ToneExposure({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => setRendererExposure(gl, exposure), [gl, exposure]);
  return null;
}

/** Sets the renderer's exposure; returns the undo. */
function setRendererExposure(renderer: WebGLRenderer, exposure: number): () => void {
  const previous = renderer.toneMappingExposure;
  renderer.toneMappingExposure = exposure;
  return () => {
    renderer.toneMappingExposure = previous;
  };
}

/** Gives a perspective camera the field of view for a viewport `aspect` (harbourView.ts). */
function fitFov(camera: Camera, aspect: number): void {
  if (!(camera instanceof PerspectiveCamera)) return;
  camera.fov = harbourFov(aspect);
  camera.updateProjectionMatrix();
}

/** Asks for frames at the backdrop's pace (framePacer.ts) while `running`; the canvas draws nothing otherwise. */
function Pacer({ running }: { running: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    if (!running) return;
    const pacer = createFramePacer(HARBOUR_FPS);
    let id = requestAnimationFrame(function tick(now) {
      if (pacer.shouldDraw(now)) invalidate();
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [running, invalidate]);
  return null;
}
