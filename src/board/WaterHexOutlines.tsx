import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Plane, Ray, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { Hex } from "../game/hex";
import {
  GRID_EMPHASIS_COLOR,
  GRID_FADE,
  GRID_LINE_COLOR,
  gridFadeForCameraDistance,
} from "./hexOutlineGrid";
import {
  buildEdgeEmphasis,
  buildEdgeLinePositions,
  buildEdgeShoreFade,
  buildHexGridEdges,
} from "./hexGridEdges";
import { createHexOutlineMaterial, setHexOutlineFade } from "./hexOutlineMaterial";

const OUTLINE_Y = 0.01;
// Segments per hex edge, so the shore fade follows the coast along each edge.
const EDGE_SUBDIVISIONS = 4;

const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
const ray = new Ray();
const hit = new Vector3();

function hasTarget(controls: unknown): controls is { target: Vector3 } {
  return (
    typeof controls === "object" &&
    controls !== null &&
    "target" in controls &&
    controls.target instanceof Vector3
  );
}

interface WaterHexOutlinesProps {
  hexes: readonly Hex[];
  /** Hex index -> minimum opacity, for hexes the player is acting on. */
  emphasis: ReadonlyMap<number, number>;
  /** Signed distance to the coast at world (x, z): + land, - water. */
  coastDistance: (x: number, z: number) => number;
}

/**
 * The water hex grid as one LineSegments draw call, built from unique edges
 * so neighbouring hexes share a single line. The focus point and the
 * zoom-scaled fade radii are pushed to the shader as uniforms each frame;
 * no React state per frame.
 */
export function WaterHexOutlines({ hexes, emphasis, coastDistance }: WaterHexOutlinesProps) {
  const controls = useThree((s) => s.controls);
  const material = useMemo(
    () => createHexOutlineMaterial(GRID_LINE_COLOR, GRID_EMPHASIS_COLOR, GRID_FADE),
    []
  );

  const edges = useMemo(() => buildHexGridEdges(hexes), [hexes]);

  const geometry = useMemo(() => {
    const positions = buildEdgeLinePositions(edges, OUTLINE_Y, EDGE_SUBDIVISIONS);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    geo.setAttribute(
      "aShore",
      new BufferAttribute(buildEdgeShoreFade(positions, coastDistance), 1)
    );
    geo.setAttribute(
      "aEmphasis",
      new BufferAttribute(buildEdgeEmphasis(edges, EDGE_SUBDIVISIONS, new Map()), 1)
    );
    geo.computeBoundingSphere();
    return geo;
  }, [edges, coastDistance]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  // Only rewritten when targets or hover change, not per frame.
  useEffect(() => {
    const attr = geometry.getAttribute("aEmphasis");
    if (!(attr instanceof BufferAttribute)) return;
    buildEdgeEmphasis(edges, EDGE_SUBDIVISIONS, emphasis, attr.array as Float32Array);
    attr.needsUpdate = true;
  }, [geometry, edges, emphasis]);

  useFrame(({ camera }) => {
    const focus = material.uniforms.uFocus.value;
    let distance: number;
    if (hasTarget(controls)) {
      focus.set(controls.target.x, controls.target.z);
      distance = camera.position.distanceTo(controls.target);
    } else {
      // Fallback: where the view direction meets the sea plane.
      camera.getWorldDirection(ray.direction);
      ray.origin.copy(camera.position);
      if (!ray.intersectPlane(groundPlane, hit)) return;
      focus.set(hit.x, hit.z);
      distance = camera.position.distanceTo(hit);
    }
    // Widen the fade as the camera pulls back so the grid keeps its screen share.
    setHexOutlineFade(material, gridFadeForCameraDistance(GRID_FADE, distance));
  });

  if (edges.count === 0) return null;

  return (
    <lineSegments
      geometry={geometry}
      material={material}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}
