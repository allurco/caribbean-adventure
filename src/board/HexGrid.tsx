import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import {
  Shape,
  ExtrudeGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  CylinderGeometry,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Hex } from "../game/hex";
import { hexToWorld, hexEquals } from "../game/hex";
import type { MapCell } from "../game/mapGenerator";
import type { Terrain } from "../game/terrain";

const TILE_SIZE = 1;
const HEX_DEPTH = 0.15;
const HIGHLIGHT_DEPTH = 0.02;
const PORT_MARKER_RADIUS = 0.35;
const PORT_MARKER_HEIGHT = 0.3;

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

const tileGeometry = new ExtrudeGeometry(createHexShape(TILE_SIZE), {
  depth: HEX_DEPTH,
  bevelEnabled: false,
});

const highlightGeometry = new ExtrudeGeometry(createHexShape(TILE_SIZE), {
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
const tempColor = new Color();

// Port marker component with its own hover handling
function PortMarker({
  cell,
  onHover,
}: {
  cell: MapCell;
  onHover: (cell: MapCell | null) => void;
}) {
  const [x, , z] = hexToWorld(cell.hex);

  return (
    <mesh
      position={[x, PORT_MARKER_HEIGHT / 2 + 0.01, z]}
      geometry={portMarkerGeometry}
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

interface HexGridProps {
  cells: MapCell[];
  terrainColors: Record<Terrain, string>;
  portColor: string;
  validTargets: Hex[];
  attackTargets?: Hex[];
  onHexClick: (hex: Hex) => void;
  onPortHover?: (cell: MapCell | null) => void;
  interactive: boolean;
}

export function HexGrid({
  cells,
  terrainColors,
  portColor,
  validTargets,
  attackTargets = [],
  onHexClick,
  onPortHover,
  interactive,
}: HexGridProps) {
  const terrainRef = useRef<InstancedMesh>(null!);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // Get all port cells for rendering markers
  const portCells = useMemo(() => cells.filter((c) => c.hasPort), [cells]);

  const targetIndices = useMemo(() => {
    const set = new Set<number>();
    validTargets.forEach((t) => {
      const idx = cells.findIndex((c) => hexEquals(c.hex, t));
      if (idx !== -1) set.add(idx);
    });
    return set;
  }, [cells, validTargets]);

  const attackTargetIndices = useMemo(() => {
    const set = new Set<number>();
    attackTargets.forEach((t) => {
      const idx = cells.findIndex((c) => hexEquals(c.hex, t));
      if (idx !== -1) set.add(idx);
    });
    return set;
  }, [cells, attackTargets]);

  const allInteractiveIndices = useMemo(() => {
    const set = new Set<number>();
    targetIndices.forEach((i) => set.add(i));
    attackTargetIndices.forEach((i) => set.add(i));
    return set;
  }, [targetIndices, attackTargetIndices]);

  const hoveredCell = useMemo(() => {
    if (hoveredId === null || !allInteractiveIndices.has(hoveredId)) return null;
    return cells[hoveredId];
  }, [hoveredId, allInteractiveIndices, cells]);

  const isHoveredAttackTarget = useMemo(() => {
    return hoveredId !== null && attackTargetIndices.has(hoveredId);
  }, [hoveredId, attackTargetIndices]);

  const attackTargetPositions = useMemo(() => {
    return attackTargets.map((t) => {
      const [x, y, z] = hexToWorld(t);
      return [x, y + 0.01, z] as [number, number, number];
    });
  }, [attackTargets]);

  useEffect(() => {
    const mesh = terrainRef.current;
    if (!mesh) return;

    const colors = new Float32Array(cells.length * 3);

    cells.forEach((cell, i) => {
      const [x, y, z] = hexToWorld(cell.hex);
      tempObject.position.set(x, y - HEX_DEPTH, z);
      tempObject.rotation.set(-Math.PI / 2, 0, 0);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);

      const color = cell.hasPort ? portColor : terrainColors[cell.terrain];
      tempColor.set(color);
      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    });

    mesh.geometry.setAttribute(
      "color",
      new InstancedBufferAttribute(colors, 3)
    );
    mesh.instanceMatrix.needsUpdate = true;
  }, [cells, terrainColors, portColor]);

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      // Handle interactive hex hovering (for movement/attack)
      if (!interactive) return;
      const id = e.instanceId;
      if (id !== undefined && allInteractiveIndices.has(id)) {
        e.stopPropagation();
        setHoveredId(id);
        document.body.style.cursor = attackTargetIndices.has(id) ? "crosshair" : "pointer";
      } else {
        setHoveredId(null);
        document.body.style.cursor = "auto";
      }
    },
    [interactive, allInteractiveIndices, attackTargetIndices]
  );

  const handlePointerOut = useCallback(() => {
    setHoveredId(null);
    document.body.style.cursor = "auto";
  }, []);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!interactive) return;
      const id = e.instanceId;
      if (id !== undefined && allInteractiveIndices.has(id)) {
        e.stopPropagation();
        onHexClick(cells[id].hex);
      }
    },
    [interactive, allInteractiveIndices, onHexClick, cells]
  );

  const hoveredPos = useMemo(() => {
    if (!hoveredCell) return null;
    const [x, y, z] = hexToWorld(hoveredCell.hex);
    return [x, y + 0.01, z] as [number, number, number];
  }, [hoveredCell]);

  return (
    <>
      <instancedMesh
        ref={terrainRef}
        args={[tileGeometry, undefined, cells.length]}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <meshStandardMaterial vertexColors />
      </instancedMesh>

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
        portCells.map((cell) => (
          <PortMarker
            key={`port-${cell.hex.q}-${cell.hex.r}`}
            cell={cell}
            onHover={onPortHover}
          />
        ))}
    </>
  );
}
