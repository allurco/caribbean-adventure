import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Plane, Ray, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { Hex } from "../game/hex";
import {
  GRID_FADE,
  buildOutlineEmphasis,
  buildOutlinePositions,
} from "./hexOutlineGrid";
import { createHexOutlineMaterial } from "./hexOutlineMaterial";

const OUTLINE_COLOR = "#ffffff";
const OUTLINE_SIZE = 0.95;
const OUTLINE_Y = 0.01;

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
  /** Outline index -> minimum opacity, for hexes the player is acting on. */
  emphasis: ReadonlyMap<number, number>;
}

/**
 * All water hex outlines as one LineSegments draw call. The focus point is
 * pushed to the shader as a uniform each frame; no React state per frame.
 */
export function WaterHexOutlines({ hexes, emphasis }: WaterHexOutlinesProps) {
  const controls = useThree((s) => s.controls);
  const material = useMemo(() => createHexOutlineMaterial(OUTLINE_COLOR, GRID_FADE), []);

  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      "position",
      new BufferAttribute(buildOutlinePositions(hexes, OUTLINE_SIZE, OUTLINE_Y), 3)
    );
    geo.setAttribute(
      "aEmphasis",
      new BufferAttribute(buildOutlineEmphasis(hexes.length, new Map()), 1)
    );
    geo.computeBoundingSphere();
    return geo;
  }, [hexes]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  // Only rewritten when targets or hover change, not per frame.
  useEffect(() => {
    const attr = geometry.getAttribute("aEmphasis");
    if (!(attr instanceof BufferAttribute)) return;
    buildOutlineEmphasis(hexes.length, emphasis, attr.array as Float32Array);
    attr.needsUpdate = true;
  }, [geometry, hexes.length, emphasis]);

  useFrame(({ camera }) => {
    const focus = material.uniforms.uFocus.value;
    if (hasTarget(controls)) {
      focus.set(controls.target.x, controls.target.z);
      return;
    }
    // Fallback: where the view direction meets the sea plane.
    camera.getWorldDirection(ray.direction);
    ray.origin.copy(camera.position);
    if (ray.intersectPlane(groundPlane, hit)) focus.set(hit.x, hit.z);
  });

  if (hexes.length === 0) return null;

  return (
    <lineSegments
      geometry={geometry}
      material={material}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}
