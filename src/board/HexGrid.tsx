import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import {
  Shape,
  ExtrudeGeometry,
  InstancedMesh,
  Object3D,
  CylinderGeometry,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Hex } from "../game/hex";
import { hexToWorld, hexEquals } from "../game/hex";
import type { MapCell } from "../game/types";
import { WaterHexOutlines } from "./WaterHexOutlines";
import { sharedTerrainField } from "./visuals/sharedTerrainField";
import { groundTopY } from "./visuals/groundPlacement";

const TILE_SIZE = 1;
const HEX_BASE_DEPTH = 0.1;
const HIGHLIGHT_DEPTH = 0.02;

const PORT_MARKER_RADIUS = 0.35;
const PORT_MARKER_HEIGHT = 0.3;
// Gap between the ground and the port marker's base
const PORT_MARKER_CLEARANCE = 0.01;
// Port name label baseline above the ground
const PORT_LABEL_HEIGHT = 0.6;
// Minimum outline opacity for hexes the player is acting on. These ignore the
// distance fade, so targets stay crisp anywhere on the map.
const OUTLINE_OPACITY_TARGET = 0.45;
const OUTLINE_OPACITY_HOVERED = 0.85;

const COLOR_HOVERED = "#facc15";
const COLOR_ATTACK_TARGET = "#ef4444";
const OPACITY_HOVERED = 0.7;
const OPACITY_ATTACK = 0.5;

function createHexShape(size: number): Shape {
  const shape = new Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const x = size * Math.cos(angle);
    const y = size * Math.sin(angle);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

const hexShape = createHexShape(TILE_SIZE);

// Water tile geometry (invisible, for raycasting)
const tileGeometry = new ExtrudeGeometry(hexShape, { depth: HEX_BASE_DEPTH, bevelEnabled: false });

const highlightGeometry = new ExtrudeGeometry(hexShape, {
  depth: HIGHLIGHT_DEPTH,
  bevelEnabled: false,
});

// Cylinder geometry for port markers - easier to hover
const portMarkerGeometry = new CylinderGeometry(
  PORT_MARKER_RADIUS,
  PORT_MARKER_RADIUS,
  PORT_MARKER_HEIGHT,
  8
);

const tempObject = new Object3D();

// A port and the height-field ground Y it stands on
interface PortSite {
  cell: MapCell;
  groundY: number;
}

// Port marker component with its own hover handling
function PortMarker({
  site: { cell, groundY },
  onHover,
}: {
  site: PortSite;
  onHover: (cell: MapCell | null) => void;
}) {
  const [x, , z] = hexToWorld(cell.hex);

  return (
    <mesh
      position={[x, groundY + PORT_MARKER_HEIGHT / 2 + PORT_MARKER_CLEARANCE, z]}
      geometry={portMarkerGeometry}
      castShadow
      onPointerEnter={(e) => {
        e.stopPropagation();
        onHover(cell);
      }}
      onPointerLeave={() => {
        onHover(null);
      }}
    >
      <meshStandardMaterial
        color="#ffffff"
        emissive="#fbbf24"
        emissiveIntensity={0.6}
      />
    </mesh>
  );
}

// Floating port name label
function PortLabel({ site: { cell, groundY } }: { site: PortSite }) {
  const [x, , z] = hexToWorld(cell.hex);

  if (!cell.portName) return null;

  return (
    <Text
      position={[x, groundY + PORT_LABEL_HEIGHT, z]}
      rotation={[0, Math.PI / 4, 0]}
      fontSize={0.4}
      color="#fef3c7"
      anchorX="center"
      anchorY="bottom"
      outlineWidth={0.02}
      outlineColor="#1c1917"
      raycast={() => null}
    >
      {cell.portName}
    </Text>
  );
}

interface HexGridProps {
  cells: MapCell[];
  validTargets: Hex[];
  attackTargets?: Hex[];
  onHexClick: (hex: Hex) => void;
  onPortHover?: (cell: MapCell | null) => void;
  interactive: boolean;
}

export function HexGrid({
  cells,
  validTargets,
  attackTargets = [],
  onHexClick,
  onPortHover,
  interactive,
}: HexGridProps) {
  const waterRef = useRef<InstancedMesh>(null!);
  // Hovered water-cell index (land is rendered and hit-tested elsewhere)
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // Water cells, the only hexes this grid hit-tests
  const { waterCells, waterIndexMap } = useMemo(() => {
    const water: MapCell[] = [];
    const waterMap = new Map<number, number>(); // original index -> water index

    cells.forEach((cell, i) => {
      if (cell.terrain === "water" || cell.terrain === "reef") {
        waterMap.set(i, water.length);
        water.push(cell);
      }
    });

    return { waterCells: water, waterIndexMap: waterMap };
  }, [cells]);

  // Port cells with the ground Y of the terrain height field under each marker
  const portSites = useMemo<PortSite[]>(() => {
    const field = sharedTerrainField(cells);
    return cells
      .filter((c) => c.hasPort)
      .map((cell) => {
        const [x, , z] = hexToWorld(cell.hex);
        return { cell, groundY: groundTopY(field, x, z, PORT_MARKER_RADIUS) };
      });
  }, [cells]);

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

  // Set up water mesh (invisible for raycasting)
  useEffect(() => {
    const mesh = waterRef.current;
    if (!mesh || waterCells.length === 0) return;

    waterCells.forEach((cell, i) => {
      const [x, y, z] = hexToWorld(cell.hex);
      tempObject.position.set(x, y - HEX_BASE_DEPTH, z);
      tempObject.rotation.set(-Math.PI / 2, 0, 0);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  }, [waterCells]);

  const handleWaterPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!interactive) return;
      const id = e.instanceId;
      if (id !== undefined && allWaterInteractive.has(id)) {
        e.stopPropagation();
        setHoveredId(id);
        document.body.style.cursor = attackWaterIndices.has(id) ? "crosshair" : "pointer";
      } else {
        setHoveredId(null);
        document.body.style.cursor = "auto";
      }
    },
    [interactive, allWaterInteractive, attackWaterIndices]
  );

  const handlePointerOut = useCallback(() => {
    setHoveredId(null);
    document.body.style.cursor = "auto";
  }, []);

  const handleWaterClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!interactive) return;
      const id = e.instanceId;
      if (id !== undefined && allWaterInteractive.has(id)) {
        e.stopPropagation();
        onHexClick(waterCells[id].hex);
      }
    },
    [interactive, allWaterInteractive, onHexClick, waterCells]
  );

  const waterHexes = useMemo(() => waterCells.map((c) => c.hex), [waterCells]);
  const coastDistance = useMemo(() => sharedTerrainField(cells).sampleCoastDistance, [cells]);

  const outlineEmphasis = useMemo(() => {
    const emphasis = new Map<number, number>();
    allWaterInteractive.forEach((i) => emphasis.set(i, OUTLINE_OPACITY_TARGET));
    if (hoveredCell && hoveredId !== null) {
      emphasis.set(hoveredId, OUTLINE_OPACITY_HOVERED);
    }
    return emphasis;
  }, [allWaterInteractive, hoveredCell, hoveredId]);

  const hoveredPos = useMemo(() => {
    if (!hoveredCell) return null;
    const [x, y, z] = hexToWorld(hoveredCell.hex);
    return [x, y + 0.01, z] as [number, number, number];
  }, [hoveredCell]);

  return (
    <>
      {/* Water hexes - invisible for raycasting only */}
      {waterCells.length > 0 && (
        <instancedMesh
          ref={waterRef}
          args={[tileGeometry, undefined, waterCells.length]}
          onPointerMove={handleWaterPointerMove}
          onPointerOut={handlePointerOut}
          onClick={handleWaterClick}
          frustumCulled={false}
          visible={false}
        >
          <meshBasicMaterial transparent opacity={0} />
        </instancedMesh>
      )}

      {/* Water hex grid: one line per shared edge, fading with distance from
          the camera focus and across the shallows; acted-on hexes stay strong */}
      <WaterHexOutlines
        hexes={waterHexes}
        emphasis={outlineEmphasis}
        coastDistance={coastDistance}
      />

      {/* Attack target highlights (red) */}
      {attackTargetPositions.map((pos, i) => (
        <mesh
          key={`attack-${i}`}
          geometry={highlightGeometry}
          position={pos}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshStandardMaterial
            transparent
            opacity={OPACITY_ATTACK}
            depthWrite={false}
            color={COLOR_ATTACK_TARGET}
          />
        </mesh>
      ))}

      {/* Hover highlight */}
      {hoveredPos && (
        <mesh
          geometry={highlightGeometry}
          position={hoveredPos}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshStandardMaterial
            transparent
            opacity={OPACITY_HOVERED}
            depthWrite={false}
            color={isHoveredAttackTarget ? COLOR_ATTACK_TARGET : COLOR_HOVERED}
          />
        </mesh>
      )}

      {/* Port markers with hover detection */}
      {onPortHover &&
        portSites.map((site) => (
          <PortMarker
            key={`port-${site.cell.hex.q}-${site.cell.hex.r}`}
            site={site}
            onHover={onPortHover}
          />
        ))}

      {/* Floating port name labels */}
      {portSites.map((site) => (
        <PortLabel key={`label-${site.cell.hex.q}-${site.cell.hex.r}`} site={site} />
      ))}
    </>
  );
}
