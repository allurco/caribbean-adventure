import { useCallback, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type { InstancedBufferGeometry, Vector3 } from "three";
import { createPool } from "./combatFx/particlePool";
import type { PuffBuffers } from "./combatFx/frameWriters";
import { PuffLayer, type PuffLook } from "./combatFx/PuffLayer";
import { shipFoamSources } from "./shipFoamSources";
import { createFleckFrame } from "./visuals/foamFlecks";
import { FOAM_FLECK_PRIORITY } from "./visuals/frameOrder";
import { useSeaSurface } from "./visuals/seaSurfaceContext";

/** Flecks all ships share; when full the oldest goes first. */
const FLECK_CAPACITY = 1024;

/** Foam white, flat on the sea like the fight's foam (CombatEffects.tsx); its opacity and fades are the flecks' own (foamFlecks.ts). */
const FLECK_LOOK: PuffLook = {
  color: "#eef4f3", shade: "#d3dcdd", lit: 0, intensity: 1, additive: false,
  opacity: 1, grow: 0, growSeconds: 1, fadeIn: 0, fadeOut: 0, stretch: 1, alongWind: false, flat: true,
};

/** The puff layer sizes its buffers from a pool's capacity; the flecks' own pool lives in createFleckFrame. */
const SIZING_POOL = createPool(FLECK_CAPACITY);

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

  const write = useCallback(
    (buffers: PuffBuffers, geometry: InstancedBufferGeometry) => {
      const { camera, controls } = get();
      const focus = (controls as { target?: Vector3 } | null)?.target;
      const n = flecks.update(
        {
          waveTime: sea ? sea.clock.waveTimeAt() : null,
          camera: [camera.position.x, camera.position.y, camera.position.z],
          focusX: focus ? focus.x : camera.position.x,
          cameraDistance: focus ? camera.position.distanceTo(focus) : Infinity,
          wrap,
          surface: sea ? sea.surface : null,
          ships: shipFoamSources,
        },
        {
          offset: buffers.offset.array as Float32Array,
          size: buffers.size.array as Float32Array,
          alpha: buffers.alpha.array as Float32Array,
          seed: buffers.seed.array as Float32Array,
        }
      );
      if (n > 0 || geometry.instanceCount > 0) {
        buffers.offset.needsUpdate = buffers.size.needsUpdate = buffers.alpha.needsUpdate = buffers.seed.needsUpdate = true;
      }
      geometry.instanceCount = n;
      return n;
    },
    [get, sea, flecks, wrap]
  );

  return <PuffLayer pool={SIZING_POOL} look={FLECK_LOOK} warm={warm} write={write} priority={FOAM_FLECK_PRIORITY} />;
}
