import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { createWrap, hexToWorld } from "../../game/hex";
import { getMapPreset } from "../../game/mapConfig";
import { generateMapFor } from "../../game/mapRequest";
import { CAMERA_DIRECTION, CAMERA_FOV, cameraNearFor } from "../../board/cameraBounds";
import { PLAYER_COLOURS } from "../../board/shipOwnerColour";
import { Ocean } from "../../board/visuals/Ocean";
import { LandTerrain } from "../../board/visuals/LandTerrain";
import { useLandTerrain } from "../../board/visuals/useLandTerrain";
import { SunLight } from "../../board/visuals/SunLight";
import { FillLight } from "../../board/visuals/FillLight";
import { PostEffects } from "../../board/visuals/PostEffects";
import { useSkyEnvironment } from "../../board/visuals/useSkyEnvironment";
import { useTerrainFieldTexture } from "../../board/visuals/useTerrainFieldTexture";
import { useWaveCascades } from "../../board/visuals/useWaveCascades";
import { useWaveClock } from "../../board/visuals/useWaveClock";
import { WAVE_CASCADES, WHITECAP_CASCADES } from "../../board/visuals/oceanWaves";
import { DISPLACEMENT_CASCADES } from "../../board/visuals/waveDisplacement";
import { createSeaSurface, fieldSeabed } from "../../board/visuals/seaSurface";
import { SeaSurfaceContext } from "../../board/visuals/seaSurfaceContext";
import { sharedTerrainField } from "../../board/visuals/sharedTerrainField";
import { sunShadowFor } from "../../board/visuals/atmosphere";
import { SCENE_LIGHTING } from "../../board/visuals/sceneLighting";
import { SCENE_WIND } from "../../board/visuals/sceneWind";
import { beatProgress, easeInOutCubic, frameShips } from "./beatTiming";
import { createDirector, type Director } from "./combatDirector";
import { combatSite, type LabParams } from "./labSetup";
import { createSeaReader } from "./frameWriters";
import { DebrisLayer, GrappleLayer, PuffLayer, ShotLayer, type PuffLook } from "./Effects";
import { LabShip } from "./LabShip";

/** How far back the camera starts, so the declaration has somewhere to fly in from. */
const OPENING_DISTANCE = 6.5;

const SMOKE: PuffLook = { color: "#ece6da", shade: "#7d828c", lit: 1, intensity: 1, additive: false, opacity: 0.8, grow: 4.5, growSeconds: 3, fadeIn: 0.004, fadeOut: 0.45 };
const FLASH: PuffLook = { color: "#ffb35c", shade: "#ffb35c", lit: 0, intensity: 6, additive: true, opacity: 1, grow: 0.8, growSeconds: 0.05, fadeIn: 0, fadeOut: 0.8 };
const SPRAY: PuffLook = { color: "#f4f8fa", shade: "#9fb3bf", lit: 1, intensity: 1.1, additive: false, opacity: 0.95, grow: 0.6, growSeconds: 0.6, fadeIn: 0, fadeOut: 0.3 };
const MIST: PuffLook = { color: "#f2f6f7", shade: "#a7b6bf", lit: 1, intensity: 1, additive: false, opacity: 0.55, grow: 2.5, growSeconds: 0.8, fadeIn: 0.02, fadeOut: 0.7 };
const DUST: PuffLook = { color: "#c9b48f", shade: "#6e5d45", lit: 1, intensity: 1, additive: false, opacity: 0.7, grow: 2.5, growSeconds: 0.6, fadeIn: 0.02, fadeOut: 0.7 };
const WOOD = ["#8a6a45", "#a07b50", "#6f5236", "#b8925f"];
const CRATES = ["#9c7a4c", "#86663e", "#a88a5a", "#7a5c38"];

const VIEW = new Vector3(...CAMERA_DIRECTION);

/** The wind's drift for smoke and flotsam, world units/s. */
const DRIFT = 0.05 * (SCENE_WIND.speed / 7);

export function CombatLabScene({ params, onDirector }: { params: LabParams; onDirector: (director: Director) => void }) {
  const lighting = SCENE_LIGHTING;
  const sunShadow = useMemo(() => sunShadowFor(lighting.sun), [lighting.sun]);
  const skyEnvironment = useSkyEnvironment(lighting);
  const waveClock = useWaveClock(false);
  const waves = useWaveCascades(WAVE_CASCADES, WHITECAP_CASCADES, DISPLACEMENT_CASCADES, waveClock);

  // A real map, for the sea's depth, the islands in sight and the seabed.
  const map = useMemo(() => {
    const preset = getMapPreset("small");
    return { cells: generateMapFor({ mapSize: "small", mapSeed: params.seed }), wrap: createWrap(preset.columns) };
  }, [params.seed]);
  const terrainField = useTerrainFieldTexture(map.cells, map.wrap, params.seed);
  const landTerrain = useLandTerrain(map.cells, map.wrap, params.seed, { sun: lighting.sun.direction, waveSlopes: waves.slopes, terrainField });
  const seaSurface = useMemo(
    () => createSeaSurface({ seabedHeightAt: fieldSeabed(sharedTerrainField(map.cells, map.wrap, params.seed)), enabled: waves.enabled }),
    [map, params.seed, waves.enabled]
  );
  const sea = useMemo(() => ({ clock: waveClock, surface: seaSurface }), [waveClock, seaSurface]);

  const site = useMemo(() => combatSite(map.cells, map.wrap, SCENE_WIND.toward, params.gap), [map, params.gap]);
  const director = useMemo(() => {
    const [ax, , az] = hexToWorld(site.a);
    const [bx, , bz] = hexToWorld(site.b);
    return createDirector({
      a: { shipClass: params.a, pose: { x: ax, z: az, heading: site.heading } },
      b: { shipClass: params.b, pose: { x: bx, z: bz, heading: site.heading } },
      actor: params.actor,
      windToward: SCENE_WIND.toward,
    });
  }, [site, params.a, params.b, params.actor]);
  useEffect(() => onDirector(director), [director, onDirector]);
  useEffect(() => {
    if (params.play.length > 0) director.enqueue(params.play);
  }, [director, params.play]);

  // The sea for the effects: the CPU swell at the wave clock's time, seen from the camera.
  const reader = useMemo(() => createSeaReader(SCENE_WIND.toward[0] * DRIFT, SCENE_WIND.toward[1] * DRIFT), []);
  useFrame(({ camera }, delta) => {
    reader.sync(seaSurface, waveClock.waveTimeAt(), camera.position);
    director.update(Math.min(delta, 1 / 20), reader.env);
  }, -1);

  const mid = useMemo(() => {
    const [ax, , az] = hexToWorld(site.a);
    const [bx, , bz] = hexToWorld(site.b);
    return new Vector3((ax + bx) / 2, 0.1, (az + bz) / 2);
  }, [site]);

  return (
    <SeaSurfaceContext.Provider value={sea}>
      <color attach="background" args={[lighting.haze.color]} />
      <fog attach="fog" args={[lighting.haze.color, lighting.haze.near, lighting.haze.far]} />
      <SunLight sun={lighting.sun} shadow={sunShadow} />
      <FillLight fill={lighting.fill} />
      <hemisphereLight color={lighting.ambient.skyColor} groundColor={lighting.ambient.groundColor} intensity={lighting.ambient.intensity} />
      {skyEnvironment && (
        <Ocean
          terrainField={terrainField}
          sun={lighting.sun.direction}
          sunColor={lighting.sun.color}
          sunIntensity={lighting.sun.intensity}
          light={lighting.ocean}
          sky={skyEnvironment.texture}
          skyHeight={skyEnvironment.textureHeight}
          skyIntensity={skyEnvironment.intensity}
          waveSlopes={waves.slopes}
          waveWhitecaps={waves.whitecaps}
          waveDisplacements={waves.displacements}
        />
      )}
      <LandTerrain terrain={landTerrain} />

      <LabShip key={`a-${params.a}-${params.actor}-${params.gap}`} director={director} shipKey="a" colour={PLAYER_COLOURS["0"]} flag="England" />
      <LabShip key={`b-${params.b}-${params.actor}-${params.gap}`} director={director} shipKey="b" colour={PLAYER_COLOURS["1"]} flag="Spain" />

      <ShotLayer director={director} />
      <GrappleLayer director={director} />
      <DebrisLayer pool={director.pools.splinter} shape="splinter" colours={WOOD} />
      <DebrisLayer pool={director.pools.crate} shape="crate" colours={CRATES} />
      <PuffLayer pool={director.pools.spray} look={SPRAY} />
      <PuffLayer pool={director.pools.mist} look={MIST} />
      <PuffLayer pool={director.pools.dust} look={DUST} />
      <PuffLayer pool={director.pools.smoke} look={SMOKE} />
      <PuffLayer pool={director.pools.flash} look={FLASH} />

      <CameraRig director={director} start={mid} />
      <PostEffects lighting={lighting} />
    </SeaSurfaceContext.Provider>
  );
}

/** Orbit controls, and the declaration's flight that frames both ships along the game's view direction. */
function CameraRig({ director, start }: { director: Director; start: Vector3 }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const flight = useRef<{ start: number; fromTarget: Vector3; fromPos: Vector3; toTarget: Vector3; toPos: Vector3 } | null>(null);

  const placed = useRef(false);

  useFrame(({ camera }) => {
    const c = controls.current;
    if (!c) return;
    if (!placed.current) {
      // The opening view: further back than the declaration's frame, so it has somewhere to fly in from.
      placed.current = true;
      c.target.copy(start);
      camera.position.copy(start).addScaledVector(VIEW, OPENING_DISTANCE);
      c.update();
    }
    const move = director.cameraMove;
    if (move && flight.current?.start !== move.start) {
      const { a, b } = director.ships;
      const frame = frameShips(a.pose, b.pose, { fovDeg: CAMERA_FOV, aspect, shipLength: Math.max(a.size.length, b.size.length) });
      const toTarget = new Vector3(...frame.target);
      flight.current = {
        start: move.start,
        fromTarget: c.target.clone(),
        fromPos: camera.position.clone(),
        toTarget,
        toPos: toTarget.clone().addScaledVector(VIEW, frame.distance),
      };
    }
    const f = flight.current;
    if (move && f) {
      const t = easeInOutCubic(beatProgress(director.time - move.start, move.seconds));
      c.target.lerpVectors(f.fromTarget, f.toTarget, t);
      camera.position.lerpVectors(f.fromPos, f.toPos, t);
      if (t >= 1) director.finishCameraMove();
      c.update();
    }
    if (camera instanceof PerspectiveCamera) {
      const near = cameraNearFor(camera.position.distanceTo(c.target));
      if (camera.near !== near) {
        camera.near = near;
        camera.updateProjectionMatrix();
      }
    }
  }, -0.5);

  return <OrbitControls ref={controls} makeDefault enableDamping={false} minDistance={0.4} maxDistance={20} maxPolarAngle={Math.PI / 2 - 0.05} />;
}
