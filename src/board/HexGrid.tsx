import { useRef, useEffect, useCallback } from "react";
import {
  Shape,
  ExtrudeGeometry,
  InstancedMesh,
  Object3D,
  CylinderGeometry,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { hexToWorld } from "../game/hex";
import type { MapCell } from "../game/types";
import { WaterHexOutlines } from "./WaterHexOutlines";
import { hoverEnter, hoverLeave } from "./sharedHover";
import type { HexGridState, PortSite } from "./useHexGrid";
import { BUILDING_MAX_HEIGHT } from "./visuals/buildingGeometry";
import { PORT_SETTLEMENT_RADIUS } from "./visuals/portSettlement";

const TILE_SIZE = 1;
const HEX_BASE_DEPTH = 0.1;
const HIGHLIGHT_DEPTH = 0.02;

// The port's hover volume (#59): invisible, covering the settlement's whole
// envelope (every building's farthest corner, PORT_SETTLEMENT_RADIUS, inside
// the hex's inradius so no neighbour's hover is taken), so a pointer over
// any part of a building or the ground between them shows the tooltip.
// The buildings themselves are the port's visual (portSettlement.ts).
const PORT_HOVER_RADIUS = PORT_SETTLEMENT_RADIUS;
const PORT_HOVER_HEIGHT = BUILDING_MAX_HEIGHT;
// Port name label baseline above the ground
const PORT_LABEL_HEIGHT = 0.6;

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

// Hover volume for a port: never drawn, raycast only
const portHoverGeometry = new CylinderGeometry(PORT_HOVER_RADIUS, PORT_HOVER_RADIUS, PORT_HOVER_HEIGHT, 8);

const tempObject = new Object3D();


// Port hover volume: an invisible cylinder over the settlement (`visible`
// false keeps it out of the draw and shadow passes; R3F still raycasts it,
// as with the water hexes below).
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
      position={[x, groundY + PORT_HOVER_HEIGHT / 2, z]}
      geometry={portHoverGeometry}
      visible={false}
      onPointerEnter={(e) => {
        e.stopPropagation();
        onHover(cell);
      }}
      onPointerLeave={() => {
        onHover(null);
      }}
    >
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
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
      // Upright and facing +z: square on to the camera, which looks due north (cameraBounds.ts)
      rotation={[0, 0, 0]}
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

/** The hex grid for one world copy (`copy` counts copies), drawing and hit-testing the shared `grid`. */
export function HexGrid({ grid, copy }: { grid: HexGridState; copy: number }) {
  const {
    waterCells,
    portSites,
    allWaterInteractive,
    attackWaterIndices,
    attackTargetPositions,
    hoveredPos,
    isHoveredAttackTarget,
    lines,
    setHover,
    onHexClick,
    onPortHover,
    interactive,
  } = grid;
  const waterRef = useRef<InstancedMesh>(null!);

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
        setHover((h) => (h.id === id && h.copy === copy ? h : hoverEnter(h, id, copy)));
        document.body.style.cursor = attackWaterIndices.has(id) ? "crosshair" : "pointer";
      } else {
        setHover((h) => hoverLeave(h, copy));
        document.body.style.cursor = "auto";
      }
    },
    [interactive, allWaterInteractive, attackWaterIndices, setHover, copy]
  );

  const handlePointerOut = useCallback(() => {
    setHover((h) => hoverLeave(h, copy));
    document.body.style.cursor = "auto";
  }, [setHover, copy]);

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

      <WaterHexOutlines lines={lines} />

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
