import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera, type Group } from "three";
import { SCENE_WIND } from "../visuals/sceneWind";
import { useSeaSurface } from "../visuals/seaSurfaceContext";
import type { CombatDirector } from "./combatDirector";
import { createSeaReader } from "./frameWriters";
import { PuffLayer, type PuffLook } from "./PuffLayer";
import { DebrisLayer } from "./DebrisLayer";
import { ShotLayer } from "./ShotLayer";
import { GrappleLayer } from "./GrappleLayer";

/** How fast the wind carries smoke and spray over the sea, world units per second. */
const WIND_DRIFT = 0.05;
/** Before the ships (Ship.tsx at 0, their wave pose at SHIP_POSE_PRIORITY), so they draw this frame's fight. */
const COMBAT_FX_PRIORITY = -0.5;
/** The longest frame the effects step over, s: a stalled tab does not throw the smoke across the map. */
const MAX_STEP = 0.1;

const SMOKE: PuffLook = { color: "#ece8df", shade: "#8e8a84", lit: 1, intensity: 1, additive: false, opacity: 0.3, grow: 2.6, growSeconds: 5, fadeIn: 0.02, fadeOut: 0.55, stretch: 3.4, flat: false };
const FLASH: PuffLook = { color: "#ffc46b", shade: "#ffc46b", lit: 0, intensity: 3.2, additive: true, opacity: 1, grow: 1.4, growSeconds: 0.05, fadeIn: 0, fadeOut: 0.7, stretch: 1, flat: false };
const SPRAY: PuffLook = { color: "#eef4f4", shade: "#9fb3b8", lit: 0.6, intensity: 1, additive: false, opacity: 0.8, grow: 0.6, growSeconds: 0.6, fadeIn: 0, fadeOut: 0.3, stretch: 1, flat: false };
const MIST: PuffLook = { color: "#e8eeee", shade: "#a9b4b6", lit: 0.7, intensity: 1, additive: false, opacity: 0.35, grow: 2.5, growSeconds: 1, fadeIn: 0.05, fadeOut: 0.6, stretch: 1.4, flat: false };
const FOAM: PuffLook = { color: "#e6efee", shade: "#cfd9da", lit: 0, intensity: 1, additive: false, opacity: 0.32, grow: 1.5, growSeconds: 2.5, fadeIn: 0.15, fadeOut: 0.6, stretch: 1, flat: true };

/**
 * The fight's effects on the board (#263): steps the combat director once a
 * frame against the one sea surface and the one wind, and draws its pools,
 * shots and grapples, each in one instanced call. The group stands on the
 * copy of the wrapping world the camera is in.
 */
export function CombatEffects({ director }: { director: CombatDirector }) {
  const group = useRef<Group>(null);
  const sea = useSeaSurface();
  const reader = useMemo(() => createSeaReader(SCENE_WIND.toward[0] * WIND_DRIFT, SCENE_WIND.toward[1] * WIND_DRIFT), []);
  useFrame(({ camera, size }, delta) => {
    if (sea) reader.sync(sea.surface, sea.clock.waveTimeAt(), camera.position);
    if (camera instanceof PerspectiveCamera) director.setView(camera.fov, size.width / Math.max(1, size.height));
    director.update(Math.min(delta, MAX_STEP), reader.env);
    if (group.current) group.current.position.x = director.copyX;
  }, COMBAT_FX_PRIORITY);
  const { pools } = director;
  return (
    <group ref={group}>
      <PuffLayer pool={pools.foam} look={FOAM} />
      <PuffLayer pool={pools.smoke} look={SMOKE} />
      <PuffLayer pool={pools.mist} look={MIST} />
      <PuffLayer pool={pools.spray} look={SPRAY} />
      <PuffLayer pool={pools.flash} look={FLASH} />
      <DebrisLayer pool={pools.splinter} />
      <ShotLayer shots={director.shots} />
      <GrappleLayer director={director} />
    </group>
  );
}
