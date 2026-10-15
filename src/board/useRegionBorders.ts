/** The borders between regions (#239), built once per map and shared by every world copy. */
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import type { MapWrap } from "../game/hex";
import type { MapCell } from "../game/types";
import { buildEdgeLinePositions } from "./hexGridEdges";
import { GRID_GLARE, GRID_GLARE_COLOR } from "./hexOutlineGrid";
import { createHexOutlineMaterial, type WaveSurface } from "./hexOutlineMaterial";
import { regionBorderEdges } from "./regionMap";
import { SCENE_LIGHTING } from "./visuals/sceneLighting";

/** A warm parchment line, apart from the grid's sea tint, so a border reads as a border. */
const REGION_BORDER_COLOR = "#f1dfb4";
/** Faint: the border is a hint on the sea, not a wall (ADR 0002). */
const REGION_BORDER_OPACITY = 0.3;
/** Just above the water grid, whose lines it runs along. */
const REGION_BORDER_Y = 0.015;
/** Segments per side, so the line rides the swell like the grid (useWaterGridLines.ts). */
const SIDE_SUBDIVISIONS = 8;
/** No fade with distance from the focus: the borders show over the whole map. */
const NO_FADE = { fadeStart: 1e6, fadeEnd: 2e6, baseOpacity: REGION_BORDER_OPACITY };

export interface RegionBorderLines {
  geometry: BufferGeometry;
  material: ReturnType<typeof createHexOutlineMaterial>;
  empty: boolean;
}

/** The region borders as one LineSegments geometry floating on the displaced sea. */
export function useRegionBorders(cells: readonly MapCell[], wrap: MapWrap, surface: WaveSurface): RegionBorderLines {
  const edges = useMemo(() => regionBorderEdges(cells, wrap), [cells, wrap]);
  const geometry = useMemo(() => {
    const positions = buildEdgeLinePositions(edges, REGION_BORDER_Y, SIDE_SUBDIVISIONS);
    const vertices = positions.length / 3;
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    geo.setAttribute("aShore", new BufferAttribute(new Float32Array(vertices).fill(1), 1));
    geo.setAttribute("aEmphasis", new BufferAttribute(new Float32Array(vertices), 1));
    geo.computeBoundingSphere();
    return geo;
  }, [edges]);
  const material = useMemo(
    () =>
      createHexOutlineMaterial(
        REGION_BORDER_COLOR,
        REGION_BORDER_COLOR,
        NO_FADE,
        { ...GRID_GLARE, opacity: REGION_BORDER_OPACITY, color: GRID_GLARE_COLOR, sun: SCENE_LIGHTING.sun.direction },
        surface
      ),
    [surface]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return useMemo(() => ({ geometry, material, empty: edges.count === 0 }), [geometry, material, edges]);
}
