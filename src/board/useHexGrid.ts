/** The hex grid's per-map and per-turn state, shared by every world copy (#36). */
import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Hex, MapWrap } from "../game/hex";
import { hexToWorld, hexEquals } from "../game/hex";
import type { MapCell } from "../game/types";
import { sharedTerrainField } from "./visuals/sharedTerrainField";
import { groundTopY } from "./visuals/groundPlacement";
import { gridLineData, useWaterGridLines, type WaterGridLines, type WaterGridLinesOptions } from "./useWaterGridLines";
import { NO_HOVER } from "./sharedHover";
import { NO_WATER_HOVER, type WaterHover } from "./waterHover";
import { perMapCache } from "./visuals/perMapCache";
import { decorationLayoutOf } from "./visuals/decorationLayout";
import { PORT_GROUND_PROBE_RADIUS, portHoverVolumeAt, portOwnBuildings, type PortHoverVolume, type TownBuilding } from "./visuals/portHover";
import { portLabelAnchor } from "./visuals/portLabel";

// Minimum outline opacity for hexes the player is acting on. These ignore the
// distance fade, so targets stay crisp anywhere on the map.
const OUTLINE_OPACITY_TARGET = 0.45;
const OUTLINE_OPACITY_HOVERED = 0.85;

/** A port, the height-field ground Y it stands on, and the volume its settlement is hovered through. */
export interface PortSite {
  cell: MapCell;
  groundY: number;
  hover: PortHoverVolume;
  /** Where the name label stands across the ground: over the middle of the town (#151). */
  labelAnchor: { x: number; z: number };
  /** The port's own buildings, its village's houses among them (#176), which the label's baseline clears as the camera sees them (#75, `portLabelLiftOver`). */
  ownBuildings: readonly TownBuilding[];
}

const portSitesOf = perMapCache((cells, wrap, worldSeed): PortSite[] => {
  const field = sharedTerrainField(cells, wrap, worldSeed);
  // The buildings as placed (the same layout the board draws), so the hover volume follows them: the kit and the village's houses.
  const { buildings, village } = decorationLayoutOf(cells, wrap, worldSeed);
  const town: readonly TownBuilding[] = [...buildings, ...village.buildings];
  return cells
    .filter((c) => c.hasPort)
    .map((cell) => {
      const [x, , z] = hexToWorld(cell.hex);
      const groundY = groundTopY(field, x, z, PORT_GROUND_PROBE_RADIUS);
      return {
        cell,
        groundY,
        hover: portHoverVolumeAt(cell.hex, groundY, town),
        labelAnchor: portLabelAnchor({ x, z }, buildings),
        ownBuildings: portOwnBuildings({ x, z }, town),
      };
    });
});

export interface HexGridProps {
  cells: MapCell[];
  wrap: MapWrap;
  /** The world seed (`G.mapSeed`) the terrain and decorations are seeded from. */
  worldSeed: number;
  validTargets: Hex[];
  attackTargets?: Hex[];
  onHexClick: (hex: Hex) => void;
  /** A click on water that is not a target. */
  onMiss?: () => void;
  onPortHover?: (cell: MapCell | null) => void;
  interactive: boolean;
  /** When this changes (a new turn), the hover is dropped, so nothing stale is previewed. */
  resetKey?: string;
  /** The displaced sea the grid lines float on (#38 step 8). */
  surface: WaterGridLinesOptions["surface"];
}

/**
 * Everything the hex grid works out once per map and turn, shared by every
 * world copy (#36): the water cells, port sites, targets, the hover (one for
 * all copies, so the same hex lights up in each) and the grid lines.
 */
export interface HexGridState {
  waterCells: MapCell[];
  portSites: PortSite[];
  allWaterInteractive: ReadonlySet<number>;
  attackWaterIndices: ReadonlySet<number>;
  attackTargetPositions: [number, number, number][];
  hoveredPos: [number, number, number] | null;
  /** The target hex under the pointer, in any copy. */
  hoveredHex: Hex | null;
  /** Any water hex under the pointer, in any copy, whatever is clickable and whoever's turn it is (the region tooltip, #239). */
  hoveredSeaHex: Hex | null;
  isHoveredAttackTarget: boolean;
  lines: WaterGridLines;
  setHover: Dispatch<SetStateAction<WaterHover>>;
  onHexClick: (hex: Hex) => void;
  /** A click on water that is not a target. */
  onMiss?: () => void;
  onPortHover?: (cell: MapCell | null) => void;
  /** The port under the pointer, in any copy (its label stays readable close in, #75). */
  hoveredPort: MapCell | null;
  interactive: boolean;
}

export function useHexGrid({
  cells,
  wrap,
  worldSeed,
  validTargets,
  attackTargets = [],
  onHexClick,
  onMiss,
  onPortHover,
  interactive,
  resetKey,
  surface,
}: HexGridProps): HexGridState {
  // Hovered water-cell indices and the copy each is hovered in: the target, and any sea hex (land is rendered and hit-tested elsewhere)
  const [hover, setHover] = useState<WaterHover>(NO_WATER_HOVER);
  // A new turn drops the target hover (state adjusted while rendering, as React's docs advise for a changed prop)
  const [hoverResetKey, setHoverResetKey] = useState(resetKey);
  if (hoverResetKey !== resetKey) {
    setHoverResetKey(resetKey);
    setHover((h) => ({ ...h, target: NO_HOVER }));
  }
  const hoveredId = hoverResetKey === resetKey ? hover.target.id : NO_HOVER.id;
  // The hovered port, kept here as well as passed on, so its label can stay readable (#75)
  const [hoveredPort, setHoveredPort] = useState<MapCell | null>(null);
  const handlePortHover = useCallback(
    (cell: MapCell | null) => {
      setHoveredPort(cell);
      onPortHover?.(cell);
    },
    [onPortHover]
  );

  // Water cells, the only hexes this grid hit-tests, and their grid lines (built once per map)
  const lineData = gridLineData(cells, wrap, worldSeed);
  const { waterCells } = lineData;
  const waterIndexMap = useMemo(() => {
    const waterMap = new Map<number, number>(); // original index -> water index
    let w = 0;
    cells.forEach((cell, i) => {
      if (cell.terrain === "water" || cell.terrain === "reef") waterMap.set(i, w++);
    });
    return waterMap;
  }, [cells]);

  // Port cells with the ground Y of the terrain height field under each marker
  const portSites = portSitesOf(cells, wrap, worldSeed);

  // Build target indices for the water mesh
  const { targetWaterIndices, attackWaterIndices } = useMemo(() => {
    const targetWater = new Set<number>();
    const attackWater = new Set<number>();

    validTargets.forEach((t) => {
      const idx = cells.findIndex((c) => hexEquals(c.hex, t));
      if (waterIndexMap.has(idx)) targetWater.add(waterIndexMap.get(idx)!);
    });

    attackTargets.forEach((t) => {
      const idx = cells.findIndex((c) => hexEquals(c.hex, t));
      if (waterIndexMap.has(idx)) attackWater.add(waterIndexMap.get(idx)!);
    });

    return { targetWaterIndices: targetWater, attackWaterIndices: attackWater };
  }, [cells, validTargets, attackTargets, waterIndexMap]);

  const allWaterInteractive = useMemo(() => {
    const set = new Set<number>();
    targetWaterIndices.forEach((i) => set.add(i));
    attackWaterIndices.forEach((i) => set.add(i));
    return set;
  }, [targetWaterIndices, attackWaterIndices]);

  const hoveredCell = useMemo(() => {
    if (hoveredId === null || !allWaterInteractive.has(hoveredId)) return null;
    return waterCells[hoveredId];
  }, [hoveredId, allWaterInteractive, waterCells]);

  const isHoveredAttackTarget = hoveredId !== null && attackWaterIndices.has(hoveredId);

  const attackTargetPositions = useMemo(() => {
    return attackTargets.map((t) => {
      const [x, y, z] = hexToWorld(t);
      return [x, y + 0.01, z] as [number, number, number];
    });
  }, [attackTargets]);


  const outlineEmphasis = useMemo(() => {
    const emphasis = new Map<number, number>();
    // Attack targets stand out; move targets do not, the reach draws its own outline (#213)
    attackWaterIndices.forEach((i) => emphasis.set(i, OUTLINE_OPACITY_TARGET));
    if (hoveredCell && hoveredId !== null) {
      emphasis.set(hoveredId, OUTLINE_OPACITY_HOVERED);
    }
    return emphasis;
  }, [attackWaterIndices, hoveredCell, hoveredId]);

  // Water hex grid: one line per shared edge, fading with distance from the
  // camera focus and across the shallows, riding the waves; acted-on hexes stay strong
  const lines = useWaterGridLines({ data: lineData, emphasis: outlineEmphasis, surface });

  const hoveredPos = useMemo(() => {
    if (!hoveredCell) return null;
    const [x, y, z] = hexToWorld(hoveredCell.hex);
    return [x, y + 0.01, z] as [number, number, number];
  }, [hoveredCell]);

  return {
    waterCells,
    portSites,
    allWaterInteractive,
    attackWaterIndices,
    attackTargetPositions,
    hoveredPos,
    hoveredHex: hoveredCell?.hex ?? null,
    hoveredSeaHex: hover.sea.id === null ? null : (waterCells[hover.sea.id]?.hex ?? null),
    isHoveredAttackTarget,
    lines,
    setHover,
    onHexClick,
    onMiss,
    onPortHover: onPortHover && handlePortHover,
    hoveredPort,
    interactive,
  };
}

