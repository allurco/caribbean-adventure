import { useCallback, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { InstancedBufferGeometry, Vector3 } from "three";
import type { PuffBuffers } from "./combatFx/frameWriters";
import { PuffLayer, type PuffMaterialLook } from "./combatFx/PuffLayer";
import { shipFoamSources } from "./shipFoamSources";
import { createFleckFrame, type FleckFrameInput, type FleckTarget } from "./visuals/foamFlecks";
import { FOAM_FLECK_PRIORITY } from "./visuals/frameOrder";
import { useSeaSurface, type SeaSurfaceValue } from "./visuals/seaSurfaceContext";

/** Flecks all ships share; when full the oldest goes first. */
const FLECK_CAPACITY = 1024;

/** Foam white, flat on the sea like the fight's foam (CombatEffects.tsx); the flecks' opacity, growth and fades are their own (foamFlecks.ts). */
const FLECK_LOOK: PuffMaterialLook = { color: "#eef4f3", shade: "#d3dcdd", lit: 0, intensity: 1, additive: false, stretch: 1, alongWind: false, flat: true };

/**
 * The ships' foam flecks (#389), all ships in one instanced draw, shed from
 * the hull foam's registry and drawn on the CPU sea only close up
 * (foamFlecks.ts `createFleckFrame`, closeFoam.ts). Drawn once, not per copy
 * of the wrapping world: each fleck is put in the copy nearest the camera.
 * While `warm` the empty layer stays in the scene, so its shader compiles
 * behind the loading screen.
 */
export function ShipFoamFlecks({ worldSeed, wrap, warm }: { worldSeed: number; wrap: number; warm: boolean }) {
  const sea = useSeaSurface();
  const get = useThree((state) => state.get);
  const flecks = useMemo(() => createFleckFrame(worldSeed, FLECK_CAPACITY), [worldSeed]);
  // Filled in place each frame, so the frame allocates nothing.
  const input = useRef<FleckFrameInput & { camera: [number, number, number] }>({
    waveTime: null, camera: [0, 0, 0], focusX: 0, focusZ: 0, cameraDistance: Infinity, wrap: 0, surface: null, ships: shipFoamSources,
  });
  const target = useRef<FleckTarget | null>(null);

  const write = useCallback(
    (buffers: PuffBuffers, geometry: InstancedBufferGeometry) => {
      const { camera, controls } = get();
      const focus = (controls as { target?: Vector3 } | null)?.target;
      target.current ??= fleckTarget(buffers);
      const n = flecks.update(fillFrame(input.current, sea, camera.position, focus, wrap), target.current);
      if (n > 0 || geometry.instanceCount > 0) {
        buffers.offset.needsUpdate = buffers.size.needsUpdate = buffers.alpha.needsUpdate = buffers.seed.needsUpdate = true;
      }
      geometry.instanceCount = n;
      return n;
    },
    [get, sea, flecks, wrap]
  );

  return <PuffLayer capacity={FLECK_CAPACITY} look={FLECK_LOOK} warm={warm} write={write} priority={FOAM_FLECK_PRIORITY} />;
}

/** This frame's camera and sea, written into the reused `input`. */
function fillFrame(
  input: FleckFrameInput & { camera: [number, number, number] },
  sea: SeaSurfaceValue | null,
  eye: Vector3,
  focus: Vector3 | undefined,
  wrap: number
): FleckFrameInput {
  input.waveTime = sea ? sea.clock.waveTimeAt() : null;
  input.camera[0] = eye.x;
  input.camera[1] = eye.y;
  input.camera[2] = eye.z;
  input.focusX = focus ? focus.x : eye.x;
  input.focusZ = focus ? focus.z : eye.z;
  input.cameraDistance = focus ? eye.distanceTo(focus) : Infinity;
  input.wrap = wrap;
  input.surface = sea ? sea.surface : null;
  return input;
}

/** The layer's instance arrays, as the flecks' writer takes them. */
function fleckTarget(buffers: PuffBuffers): FleckTarget {
  return {
    offset: buffers.offset.array as Float32Array,
    size: buffers.size.array as Float32Array,
    alpha: buffers.alpha.array as Float32Array,
    seed: buffers.seed.array as Float32Array,
  };
}
