/** The water hex grid lines, built once per map and shared by every world copy (#36). */
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Plane, Ray, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { MapCell } from "../game/types";
import { perMapCache } from "./visuals/perMapCache";
import { sharedTerrainField } from "./visuals/sharedTerrainField";
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
  type HexGridEdges,
} from "./hexGridEdges";
import { createHexOutlineMaterial, setHexOutlineFade, type WaveSurface } from "./hexOutlineMaterial";

const OUTLINE_Y = 0.01;
// Segments per hex edge, so the shore fade follows the coast along each edge
// and the lines follow the swell they float on (#38 step 8: a 1-unit edge
// in 8 segments of ~8 m rides a 48 m wave within a few centimetres).
const EDGE_SUBDIVISIONS = 8;
/** A hex edge is one unit (hex.ts: circumradius 1), so a segment is this long. */
const SEGMENT_UNITS = 1 / EDGE_SUBDIVISIONS;

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

/** The water cells and their grid lines, CPU-side. */
export interface GridLineData {
  /** Water and reef cells, in map order: the hexes the grid draws and hit-tests. */
  waterCells: MapCell[];
  edges: HexGridEdges;
  positions: Float32Array;
  /** Per-vertex fade across the shallows. */
  shore: Float32Array;
}

/**
 * The grid lines of a map, built once per map and wrap (edges on the seam
 * are drawn once, #36), faded across the shallows by the shared terrain field.
 */
export const gridLineData = perMapCache((cells, wrap): GridLineData => {
  const waterCells = cells.filter((c) => c.terrain === "water" || c.terrain === "reef");
  const edges = buildHexGridEdges(
    waterCells.map((c) => c.hex),
    wrap
  );
  const positions = buildEdgeLinePositions(edges, OUTLINE_Y, EDGE_SUBDIVISIONS);
  const shore = buildEdgeShoreFade(positions, sharedTerrainField(cells, wrap).sampleCoastDistance);
  return { waterCells, edges, positions, shore };
});

export interface WaterGridLinesOptions {
  data: GridLineData;
  /** Hex index (into `data.waterCells`) -> minimum opacity, for hexes the player is acting on. */
  emphasis: ReadonlyMap<number, number>;
  /** The displaced sea the lines float on (#38 step 8); a new object rebuilds the material. */
  surface: Omit<WaveSurface, "segmentUnits">;
}

/** The grid lines' geometry and material, shared by every world copy. */
export interface WaterGridLines {
  geometry: BufferGeometry;
  material: ReturnType<typeof createHexOutlineMaterial>;
  /** True when there are no water edges to draw. */
  empty: boolean;
}

/**
 * The water hex grid as one LineSegments geometry, built once per map from
 * unique edges so neighbouring hexes share a single line. The focus point and
 * the zoom-scaled fade radii are pushed to the shader as uniforms each frame
 * (once, however many world copies draw it); no React state per frame.
 */
export function useWaterGridLines({ data, emphasis, surface }: WaterGridLinesOptions): WaterGridLines {
  const controls = useThree((s) => s.controls);
  const material = useMemo(
    () => createHexOutlineMaterial(GRID_LINE_COLOR, GRID_EMPHASIS_COLOR, GRID_FADE, { ...surface, segmentUnits: SEGMENT_UNITS }),
    [surface]
  );

  const { edges } = data;

  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(data.positions, 3));
    geo.setAttribute("aShore", new BufferAttribute(data.shore, 1));
    geo.setAttribute(
      "aEmphasis",
      new BufferAttribute(buildEdgeEmphasis(edges, EDGE_SUBDIVISIONS, new Map()), 1)
    );
    geo.computeBoundingSphere();
    return geo;
  }, [data, edges]);

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
    // Widen the fade as the camera pulls back, until at full zoom-out the
    // whole visible map is gridded.
    setHexOutlineFade(material, gridFadeForCameraDistance(GRID_FADE, distance));
  });

  return useMemo(() => ({ geometry, material, empty: edges.count === 0 }), [geometry, material, edges]);
}

