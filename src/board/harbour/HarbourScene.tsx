import { use, useEffect, useMemo, useReducer, useRef } from "react";
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
import { isSettled, settleStep, shouldCompile, UNSETTLED } from "./harbourSettle";
import { harbourCamera, harbourFov, type Vec3 } from "./harbourView";
import { harbourWorldOnce, type HarbourWorld } from "./harbourWorld";

export interface HarbourSceneProps {
  /** The waves run; until then they are held at the moment the still was captured at. Frozen anyway under reduced motion. */
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
  const world = use(harbourWorldOnce());
  const { onFailed } = props;
  const view = useMemo(() => harbourCamera(world.target), [world.target]);
  return (
    <ErrorBoundary fallback={null} onError={onFailed}>
      <Canvas
        frameloop="demand"
        dpr={1}
        shadows={false}
        gl={{ antialias: true, powerPreference: "low-power" }}
        camera={{ fov: CAMERA_FOV, near: view.near, far: 1000, position: view.position }}
        onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", (event) => onFailed(event), { once: true })}
        style={{ position: "absolute", inset: 0 }}
      >
        <Harbour world={world} {...props} />
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

  const sky = useSkyEnvironment(lighting);
  const waveClock = useWaveClock(frozen);
  const waves = useWaveCascades(WAVE_CASCADES, WHITECAP_CASCADES, DISPLACEMENT_CASCADES, waveClock);
  const terrainField = useTerrainFieldTexture(cells, wrap, seed);
  const land = useLandTerrain(cells, wrap, seed, { sun: lighting.sun.direction, waveSlopes: waves.slopes, terrainField });
  const decorations = useDecorationLayout(cells, wrap, seed);

  const settled = useSettledSignal(sky !== null, onSettled);

  return (
    <>
      <FixedView target={target} />
      <ToneExposure exposure={lighting.grade.exposure} />
      <Pacer running={!settled || !frozen} />

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
        if (live) step("compiled");
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
    set({ controls: Object.assign(new EventDispatcher(), { target: new Vector3(...view.target) }) });
    invalidate();
  }, [camera, target, set, invalidate]);

  useEffect(() => {
    if (size.height <= 0) return;
    fitFov(camera, size.width / size.height);
    invalidate();
  }, [camera, size, invalidate]);
  return null;
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
