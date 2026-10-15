/**
 * The regions' chart texture (#239, layout in `regionChart.ts`): the names
 * where `placeRegionNames` put them, in the map's chart lettering, and the
 * seams between regions when the borders are drawn in the water. Drawn on
 * a canvas once per map, in a fallback serif at once and again once IM Fell
 * English SC has loaded.
 */
import { useEffect, useMemo, useState } from "react";
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping } from "three";
import { wrapWorldWidth } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { regionBorderEdges } from "../regionMap";
import { REGION_NAME_LETTER_SPACING, REGION_NAME_LINE_HEIGHT, type RegionNamePlacement } from "../regionNamePlacement";
import { loadMapFont, MAP_FONT_FAMILY } from "../loadMapFont";
import { regionChartSize } from "./regionChart";
import type { TerrainFieldTexture } from "./useTerrainFieldTexture";

/** The seam's soft profile: strokes from wide and faint to narrow, added up (world units wide, share of full ink). */
const SEAM_STROKES: readonly (readonly [number, number])[] = [
  [0.6, 0.22],
  [0.34, 0.3],
  [0.14, 0.48],
];
/** The letters' soft edge, in ems: ink bleeding into the water a little. */
const NAME_BLUR = 0.06;

/** The chart for this map, or null before there is a canvas (outside the browser). */
export function useRegionChart(
  cells: readonly MapCell[],
  names: readonly RegionNamePlacement[],
  terrainField: TerrainFieldTexture,
  seams: boolean
): CanvasTexture | null {
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let live = true;
    void loadMapFont().then(() => {
      if (live) setFontReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const texture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const { bounds, wrap } = terrainField;
    const { width, height, texelsPerUnit } = regionChartSize(bounds);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    // On a wrapping map anything near the seam is drawn on both sides of it
    const period = wrap ? wrapWorldWidth(wrap) : 0;
    const copies = period ? [-period, 0, period] : [0];
    const px = (x: number) => (x - bounds.minX) * texelsPerUnit;
    const pz = (z: number) => (z - bounds.minZ) * texelsPerUnit;

    if (seams) {
      const edges = regionBorderEdges(cells, wrap);
      ctx.lineCap = "round";
      for (const [widthUnits, ink] of SEAM_STROKES) {
        ctx.strokeStyle = `rgba(0, 255, 0, ${ink})`;
        ctx.lineWidth = widthUnits * texelsPerUnit;
        ctx.beginPath();
        for (let e = 0; e < edges.count; e++) {
          const c = edges.corners;
          for (const off of copies) {
            ctx.moveTo(px(c[e * 4] + off), pz(c[e * 4 + 1]));
            ctx.lineTo(px(c[e * 4 + 2] + off), pz(c[e * 4 + 3]));
          }
        }
        ctx.stroke();
      }
    }

    ctx.fillStyle = "rgb(255, 0, 0)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const name of names) {
      const em = name.size * texelsPerUnit;
      ctx.font = `${em}px ${fontReady ? MAP_FONT_FAMILY : "Georgia, serif"}`;
      ctx.letterSpacing = `${REGION_NAME_LETTER_SPACING * em}px`;
      ctx.shadowColor = "rgba(255, 0, 0, 0.8)";
      ctx.shadowBlur = NAME_BLUR * em;
      for (const off of copies) {
        ctx.save();
        ctx.translate(px(name.x + off), pz(name.z));
        // Canvas y runs south (+z), as the angle does
        ctx.rotate(name.angle);
        name.lines.forEach((line, i) => {
          const y = (i - (name.lines.length - 1) / 2) * REGION_NAME_LINE_HEIGHT * em;
          // Condensed to the width the placement checked, should the font run wider
          ctx.fillText(line, 0, y, name.width * texelsPerUnit);
        });
        ctx.restore();
      }
    }

    const tex = new CanvasTexture(canvas);
    // Canvas row 0 is the field's minZ, as terrainFieldUv reads it
    tex.flipY = false;
    tex.wrapS = wrap ? RepeatWrapping : ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, [cells, names, terrainField, seams, fontReady]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}
