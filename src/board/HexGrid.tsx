import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import {
  Shape,
  ExtrudeGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Hex } from "../game/hex";
import { hexToWorld, hexEquals } from "../game/hex";
import type { MapCell } from "../game/mapGenerator";
import type { Terrain } from "../game/terrain";

const TILE_SIZE = 1;
const HEX_DEPTH = 0.15;
const HIGHLIGHT_DEPTH = 0.02;

const COLOR_HOVERED = "#facc15";
const OPACITY_HOVERED = 0.7;

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

const tempObject = new Object3D();
const tempColor = new Color();

interface HexGridProps {
  cells: MapCell[];
  terrainColors: Record<Terrain, string>;
  portColor: string;
  validTargets: Hex[];
  onHexClick: (hex: Hex) => void;
  interactive: boolean;
}

export function HexGrid({
  cells,
  terrainColors,
  portColor,
  validTargets,
  onHexClick,
  interactive,
}: HexGridProps) {
  const terrainRef = useRef<InstancedMesh>(null!);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const targetIndices = useMemo(() => {
    const set = new Set<number>();
    validTargets.forEach((t) => {
      const idx = cells.findIndex((c) => hexEquals(c.hex, t));
      if (idx !== -1) set.add(idx);
    });
    return set;
  }, [cells, validTargets]);

  const hoveredCell = useMemo(() => {
    if (hoveredId === null || !targetIndices.has(hoveredId)) return null;
    return cells[hoveredId];
  }, [hoveredId, targetIndices, cells]);

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
      if (!interactive) return;
      const id = e.instanceId;
      if (id !== undefined && targetIndices.has(id)) {
        e.stopPropagation();
        setHoveredId(id);
        document.body.style.cursor = "pointer";
      } else {
        setHoveredId(null);
        document.body.style.cursor = "auto";
      }
    },
    [interactive, targetIndices]
  );

  const handlePointerOut = useCallback(() => {
    setHoveredId(null);
    document.body.style.cursor = "auto";
  }, []);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!interactive) return;
      const id = e.instanceId;
      if (id !== undefined && targetIndices.has(id)) {
        e.stopPropagation();
        onHexClick(cells[id].hex);
      }
    },
    [interactive, targetIndices, onHexClick, cells]
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
            color={COLOR_HOVERED}
          />
        </mesh>
      )}
    </>
  );
}
