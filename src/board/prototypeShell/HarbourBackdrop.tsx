import { useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { createWrap, hexToWorld, type MapWrap } from "../../game/hex";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import type { MapCell } from "../../game/types";
import { Ocean } from "../visuals/Ocean";
import { LandTerrain } from "../visuals/LandTerrain";
import { useLandTerrain } from "../visuals/useLandTerrain";
import { TerrainDecorations } from "../visuals/TerrainDecorations";
import { useDecorationLayout } from "../visuals/useDecorationLayout";
import { SunLight } from "../visuals/SunLight";
import { FillLight } from "../visuals/FillLight";
import { useSkyEnvironment } from "../visuals/useSkyEnvironment";
import { useWaveCascades } from "../visuals/useWaveCascades";
import { useTerrainFieldTexture } from "../visuals/useTerrainFieldTexture";
import { WAVE_CASCADES, WHITECAP_CASCADES } from "../visuals/oceanWaves";
import { DISPLACEMENT_CASCADES } from "../visuals/waveDisplacement";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { CAMERA_DIRECTION, CAMERA_FOV, cameraNearFor } from "../cameraBounds";
import {
  BLOOM_INTENSITY,
  BLOOM_SMOOTHING,
  BLOOM_THRESHOLD,
  FILL_COLOR,
  FILL_INTENSITY,
  FILL_OFFSET,
  HAZE_COLOR,
  HAZE_FAR,
  HAZE_NEAR,
  SHADOW_MAP_TYPE,
  SUN_COLOR,
  SUN_DIRECTION,
  SUN_INTENSITY,
  SUN_OFFSET,
  SUN_SHADOW,
  VIGNETTE_DARKNESS,
  VIGNETTE_OFFSET,
} from "../visuals/atmosphere";

/**
 * THROWAWAY PROTOTYPE (variant A): the game's own sea, islands and a port as
 * a read-only backdrop. A fixed small map, a slow drift along the coast, no
 * game state and no moves.
 */

const SEED = 20260;
const DISTANCE = 6.5;

interface Harbour {
  cells: MapCell[];
  wrap: MapWrap;
  port: [number, number, number];
}

function buildHarbour(): Harbour {
  const preset = getMapPreset("small");
  const wrap = createWrap(preset.columns);
  const cells = generateMap(preset, SEED, wrap);
  const ports = cells.filter((c) => c.hasPort);
  // The port nearest the middle of the map, so the drift stays over land and sea.
  const mid = hexToWorld(cells[Math.floor(cells.length / 2)].hex);
  const port = ports.sort((a, b) => dist(hexToWorld(a.hex), mid) - dist(hexToWorld(b.hex), mid))[0] ?? cells[0];
  return { cells, wrap, port: hexToWorld(port.hex) };
}

function dist(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function Drift({ target }: { target: [number, number, number] }) {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    const x = target[0] + Math.sin(t * 0.04) * 1.6 + 1.2;
    const z = target[2] + Math.cos(t * 0.03) * 0.6;
    camera.position.set(x + CAMERA_DIRECTION[0] * DISTANCE, CAMERA_DIRECTION[1] * DISTANCE, z + CAMERA_DIRECTION[2] * DISTANCE);
    camera.lookAt(x, 0, z);
    const near = cameraNearFor(DISTANCE);
    if ("near" in camera && camera.near !== near) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  }, -1);
  return null;
}

function Scene({ harbour }: { harbour: Harbour }) {
  const sky = useSkyEnvironment(SUN_DIRECTION);
  const reducedMotion = usePrefersReducedMotion();
  const waves = useWaveCascades(WAVE_CASCADES, WHITECAP_CASCADES, DISPLACEMENT_CASCADES, reducedMotion);
  const terrainField = useTerrainFieldTexture(harbour.cells, harbour.wrap);
  const land = useLandTerrain(harbour.cells, harbour.wrap, { sun: SUN_DIRECTION, waveSlopes: waves.slopes, terrainField });
  const decorations = useDecorationLayout(harbour.cells, harbour.wrap);
  return (
    <>
      <Drift target={harbour.port} />
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
      <EffectComposer>
        <Bloom intensity={BLOOM_INTENSITY} luminanceThreshold={BLOOM_THRESHOLD} luminanceSmoothing={BLOOM_SMOOTHING} />
        <Vignette darkness={VIGNETTE_DARKNESS} offset={VIGNETTE_OFFSET} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}

export function HarbourBackdrop() {
  const harbour = useMemo(() => buildHarbour(), []);
  return (
    <div className="absolute inset-0 bg-[#0a1929]">
      <Canvas
        shadows={{ type: SHADOW_MAP_TYPE }}
        camera={{ position: [harbour.port[0], DISTANCE, harbour.port[2] + DISTANCE], fov: CAMERA_FOV, near: 0.1, far: 1000 }}
        style={{ background: "#0a1929" }}
      >
        <Scene harbour={harbour} />
      </Canvas>
    </div>
  );
}
