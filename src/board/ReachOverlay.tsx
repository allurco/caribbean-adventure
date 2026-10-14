import { useLayoutEffect, useRef } from "react";
import { type BufferGeometry, CircleGeometry, InstancedMesh, Object3D, Shape, ShapeGeometry } from "three";
import type { Hex } from "../game/hex";
import { hexToWorld } from "../game/hex";
import type { Point } from "./shipMotion";
import { reachOpacity } from "./routePreview";

// The turn's reach and a previewed route on the water (#213): one flat fill
// per cost shade and a dotted line (routePreview.ts). Drawn only; the hex
// grid hit-tests.

/** Fill inset from the hex's edge, so the grid lines between still read. */
const FILL_INSET = 0.92;
const FILL_Y = 0.012;
const DOT_Y = 0.03;
const DOT_RADIUS = 0.055;
const REACH_COLOUR = "#fcd34d";
const ROUTE_COLOUR = "#fffbeb";
const TARGET_OPACITY = 0.5;

function hexShape(size: number): Shape {
  const shape = new Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    if (i === 0) shape.moveTo(size * Math.cos(angle), size * Math.sin(angle));
    else shape.lineTo(size * Math.cos(angle), size * Math.sin(angle));
  }
  shape.closePath();
  return shape;
}

// Flat in xz: the shape's y runs along -z once laid down (rotation x -90°)
const fillGeometry = new ShapeGeometry(hexShape(FILL_INSET)).rotateX(-Math.PI / 2);
const dotGeometry = new CircleGeometry(DOT_RADIUS, 12).rotateX(-Math.PI / 2);
const placer = new Object3D();

/** Flat marks of `geometry` at `points`, all at height `y`. */
function Marks({
  geometry,
  points,
  y,
  color,
  opacity,
  renderOrder,
}: {
  geometry: BufferGeometry;
  points: readonly Point[];
  y: number;
  color: string;
  opacity: number;
  renderOrder: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    points.forEach(([x, z], i) => {
      placer.position.set(x, y, z);
      placer.updateMatrix();
      m.setMatrixAt(i, placer.matrix);
    });
    m.count = points.length;
    m.instanceMatrix.needsUpdate = true;
  }, [points, y]);
  return (
    <instancedMesh
      ref={ref}
      // Sized to the points: a new count is a new mesh (keyed by the caller)
      args={[geometry, undefined, Math.max(1, points.length)]}
      frustumCulled={false}
      raycast={() => null}
      renderOrder={renderOrder}
    >
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} fog={false} />
    </instancedMesh>
  );
}

const hexPoint = (h: Hex): Point => {
  const [x, , z] = hexToWorld(h);
  return [x, z];
};

export interface ReachOverlayProps {
  /** Hex centres in reach by cost (`reachLayers`), cheapest first. */
  layers: readonly { cost: number; points: readonly Point[] }[];
  /** The previewed route's dots (`routeDots`), and the hex it ends on. */
  dots: readonly Point[];
  target: Hex | null;
}

/** The reach and route for one world copy. */
export function ReachOverlay({ layers, dots, target }: ReachOverlayProps) {
  return (
    <>
      {layers.map(({ cost, points }) => (
        <Marks
          key={`${cost}-${points.length}`}
          geometry={fillGeometry}
          points={points}
          y={FILL_Y}
          color={REACH_COLOUR}
          opacity={reachOpacity(cost)}
          renderOrder={2}
        />
      ))}
      {target && (
        <mesh geometry={fillGeometry} position={[hexPoint(target)[0], FILL_Y + 0.002, hexPoint(target)[1]]} raycast={() => null} renderOrder={2}>
          <meshBasicMaterial color={REACH_COLOUR} transparent opacity={TARGET_OPACITY} depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
      )}
      {dots.length > 0 && (
        <Marks key={dots.length} geometry={dotGeometry} points={dots} y={DOT_Y} color={ROUTE_COLOUR} opacity={0.95} renderOrder={3} />
      )}
    </>
  );
}
