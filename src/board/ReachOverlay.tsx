import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, DoubleSide, InstancedMesh, NormalBlending, Object3D } from "three";
import type { Point } from "./shipMotion";

// The turn's reach and a previewed route on the water (#213): an outline
// round the reach, faint rings where the cost steps up, a light tint on the
// hexes one move away, the route's end hex and its dots (reachOutline.ts,
// routePreview.ts). Drawn only; the hex grid hit-tests.

const DOT_Y = 0.03;
const DOT_RADIUS = 0.055;
const OUTLINE_COLOUR = "#fef3c7";
const TINT_COLOUR = "#fcd34d";
/** The open sea a coaster would lose hull on (#340): a cold, dark wash over the water. */
const DEEP_COLOUR = "#0b1e3a";
const ROUTE_COLOUR = "#fffbeb";

const dotGeometry = new CircleGeometry(DOT_RADIUS, 12).rotateX(-Math.PI / 2);
const placer = new Object3D();

/** Triangles at the given positions (x, y, z per vertex) in one flat colour. */
function Triangles({
  positions,
  color,
  opacity,
  renderOrder,
  additive = false,
}: {
  positions: Float32Array;
  color: string;
  opacity: number;
  renderOrder: number;
  /** Lighten what lies under rather than paint over it: a tint that keeps the water's colour. */
  additive?: boolean;
}) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (positions.length === 0) return null;
  return (
    <mesh geometry={geometry} frustumCulled={false} raycast={() => null} renderOrder={renderOrder}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
        fog={false}
        side={DoubleSide}
        blending={additive ? AdditiveBlending : NormalBlending}
      />
    </mesh>
  );
}

function Dots({ points }: { points: readonly Point[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    points.forEach(([x, z], i) => {
      placer.position.set(x, DOT_Y, z);
      placer.updateMatrix();
      m.setMatrixAt(i, placer.matrix);
    });
    m.count = points.length;
    m.instanceMatrix.needsUpdate = true;
  }, [points]);
  return (
    <instancedMesh
      ref={ref}
      // Sized to the points: a new count is a new mesh (keyed by the caller)
      args={[dotGeometry, undefined, Math.max(1, points.length)]}
      frustumCulled={false}
      raycast={() => null}
      renderOrder={4}
    >
      <meshBasicMaterial color={ROUTE_COLOUR} transparent opacity={0.95} depthWrite={false} toneMapped={false} fog={false} />
    </instancedMesh>
  );
}

export interface ReachShapes {
  /** The light tint on the hexes one move away, clipped to water. */
  tint: Float32Array;
  /** The reach's deep sea hexes where the ship would lose hull ending its turn (#340), clipped to water; empty for ocean-going ships. */
  deep: Float32Array;
  /** The outline round the reach, as ribbons. */
  outline: Float32Array;
  /** The rings where the cost steps up, as ribbons. */
  rings: Float32Array;
}

export interface ReachOverlayProps {
  reach: ReachShapes | null;
  /** The previewed route's end hex, clipped to water, and its dots. */
  target: Float32Array | null;
  dots: readonly Point[];
}

/** The reach and route for one world copy. */
export function ReachOverlay({ reach, target, dots }: ReachOverlayProps) {
  return (
    <>
      {reach && (
        <>
          <Triangles positions={reach.deep} color={DEEP_COLOUR} opacity={0.22} renderOrder={2} />
          <Triangles positions={reach.tint} color={TINT_COLOUR} opacity={0.05} renderOrder={2} additive />
          <Triangles positions={reach.rings} color={OUTLINE_COLOUR} opacity={0.3} renderOrder={3} />
          <Triangles positions={reach.outline} color={OUTLINE_COLOUR} opacity={0.75} renderOrder={3} />
        </>
      )}
      {target && <Triangles positions={target} color={TINT_COLOUR} opacity={0.4} renderOrder={2} />}
      {dots.length > 0 && <Dots key={dots.length} points={dots} />}
    </>
  );
}
