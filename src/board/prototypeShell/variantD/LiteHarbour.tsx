import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { createWrap, hexToWorld, type MapWrap } from "../../../game/hex";
import { generateMap } from "../../../game/mapGenerator";
import { getMapPreset } from "../../../game/mapConfig";
import type { MapCell } from "../../../game/types";
import { Ocean } from "../../visuals/Ocean";
import { LandTerrain } from "../../visuals/LandTerrain";
import { useLandTerrain } from "../../visuals/useLandTerrain";
import { TerrainDecorations } from "../../visuals/TerrainDecorations";
import { useDecorationLayout } from "../../visuals/useDecorationLayout";
import { SunLight } from "../../visuals/SunLight";
import { FillLight } from "../../visuals/FillLight";
import { useSkyEnvironment } from "../../visuals/useSkyEnvironment";
import { useWaveCascades } from "../../visuals/useWaveCascades";
import { useTerrainFieldTexture } from "../../visuals/useTerrainFieldTexture";
import { WAVE_CASCADES, WHITECAP_CASCADES } from "../../visuals/oceanWaves";
import { DISPLACEMENT_CASCADES } from "../../visuals/waveDisplacement";
import { usePrefersReducedMotion } from "../../usePrefersReducedMotion";
import { CAMERA_DIRECTION, CAMERA_FOV, cameraNearFor } from "../../cameraBounds";
import { FILL_COLOR, FILL_INTENSITY, FILL_OFFSET, HAZE_COLOR, HAZE_FAR, HAZE_NEAR, SUN_COLOR, SUN_DIRECTION, SUN_INTENSITY, SUN_OFFSET, SUN_SHADOW } from "../../visuals/atmosphere";

/**
 * THROWAWAY PROTOTYPE — variant D's backdrop scene: A's harbour (same seed,
 * same port) cut down to be a backdrop, not a game view.
 *
 * - The camera is fixed (A drifts), so a still of the scene can stand in for
 *   it pixel for pixel until it is ready (harbour-still.jpg, see HarbourWindow).
 * - DPR 1, no shadow maps, no postprocessing (bloom, vignette and the extra
 *   tone-mapping pass); the vignette is done in CSS.
 * - Frames on demand at 30 fps for the waves, or never with reduced motion.
 * - `onReady` fires once the sky has arrived and a run of frames has drawn
 *   after it, so the shaders are compiled and nothing is still popping in.
 */

const SEED = 20260;
const DISTANCE = 6.5;
const FPS = 30;
const SETTLE_FRAMES = 12;

interface Harbour {
  cells: MapCell[];
  wrap: MapWrap;
  /** Where the fixed camera looks. */
  target: [number, number, number];
}

function buildHarbour(): Harbour {
  const preset = getMapPreset("small");
  const wrap = createWrap(preset.columns);
  const cells = generateMap(preset, SEED, wrap);
  const ports = cells.filter((c) => c.hasPort);
  const mid = hexToWorld(cells[Math.floor(cells.length / 2)].hex);
  const port = ports.sort((a, b) => dist(hexToWorld(a.hex), mid) - dist(hexToWorld(b.hex), mid))[0] ?? cells[0];
  const p = hexToWorld(port.hex);
  // A's drift at t = 0, held still.
  return { cells, wrap, target: [p[0] + 1.2, 0, p[2] + 0.6] };
}

function dist(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** Built once per page: switching screens or framing never rebuilds the map. */
let cached: Harbour | null = null;
function harbourOnce(): Harbour {
  cached ??= buildHarbour();
  return cached;
}

function FixedCamera({ target }: { target: [number, number, number] }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { camera, invalidate } = get();
    camera.position.set(target[0] + CAMERA_DIRECTION[0] * DISTANCE, CAMERA_DIRECTION[1] * DISTANCE, target[2] + CAMERA_DIRECTION[2] * DISTANCE);
    camera.lookAt(target[0], 0, target[2]);
    if ("near" in camera) {
      camera.near = cameraNearFor(DISTANCE);
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [get, target]);
  return null;
}

/** Drives the on-demand frameloop at a fixed rate. */
function Ticker({ still }: { still: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    if (still) return;
    const id = window.setInterval(() => invalidate(), 1000 / FPS);
    return () => window.clearInterval(id);
  }, [invalidate, still]);
  return null;
}

function SettleWatch({ armed, onReady }: { armed: boolean; onReady: () => void }) {
  const frames = useRef(0);
  const done = useRef(false);
  const invalidate = useThree((s) => s.invalidate);
  useFrame(() => {
    if (!armed || done.current) return;
    frames.current += 1;
    if (frames.current >= SETTLE_FRAMES) {
      done.current = true;
      onReady();
    } else invalidate(); // keep drawing until settled, even when the ticker is still
  });
  return null;
}

function Scene({ harbour, onReady }: { harbour: Harbour; onReady: () => void }) {
  const sky = useSkyEnvironment(SUN_DIRECTION);
  const reducedMotion = usePrefersReducedMotion();
  const waves = useWaveCascades(WAVE_CASCADES, WHITECAP_CASCADES, DISPLACEMENT_CASCADES, reducedMotion);
  const terrainField = useTerrainFieldTexture(harbour.cells, harbour.wrap);
  const land = useLandTerrain(harbour.cells, harbour.wrap, { sun: SUN_DIRECTION, waveSlopes: waves.slopes, terrainField });
  const decorations = useDecorationLayout(harbour.cells, harbour.wrap);
  return (
    <>
      <FixedCamera target={harbour.target} />
      <Ticker still={reducedMotion} />
      <SettleWatch armed={sky !== null} onReady={onReady} />
      <color attach="background" args={[HAZE_COLOR]} />
      <fog attach="fog" args={[HAZE_COLOR, HAZE_NEAR, HAZE_FAR]} />
      <SunLight color={SUN_COLOR} intensity={SUN_INTENSITY} offset={SUN_OFFSET} shadow={SUN_SHADOW} />
      <FillLight color={FILL_COLOR} intensity={FILL_INTENSITY} offset={FILL_OFFSET} />
      {sky && (
        <Ocean
          terrainField={terrainField}
          sun={SUN_DIRECTION}
          sunColor={SUN_COLOR}
          sunIntensity={SUN_INTENSITY}
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
      {/* The water is lit in HDR and needs the game's tone-mapping pass (the
          composer also draws the frame: the prepasses' positive priorities
          turn off R3F's own render). Bloom and vignette are left out. */}
      <EffectComposer multisampling={4}>
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}

export function LiteHarbour({ onReady }: { onReady: () => void }) {
  const harbour = useMemo(() => harbourOnce(), []);
  return (
    <Canvas
      frameloop="demand"
      dpr={1}
      gl={{ antialias: true, powerPreference: "low-power" }}
      camera={{ fov: CAMERA_FOV, near: 0.1, far: 1000 }}
      style={{ position: "absolute", inset: 0 }}
    >
      <Scene harbour={harbour} onReady={onReady} />
    </Canvas>
  );
}
