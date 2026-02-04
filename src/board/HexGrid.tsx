import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import {
  Shape,
  ExtrudeGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  CylinderGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineLoop,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Hex } from "../game/hex";
import { hexToWorld, hexEquals } from "../game/hex";
import type { MapCell, Decoration, Elevation, Biome } from "../game/types";
import type { Terrain } from "../game/terrain";

const TILE_SIZE = 1;
const HEX_BASE_DEPTH = 0.1;
const HIGHLIGHT_DEPTH = 0.02;

// Height of hex TOP surface above water level for each elevation
// Beach is almost at sea level, jungle and mountain are progressively higher
const ELEVATION_TOP_HEIGHTS: Record<Elevation, number> = {
  0: 0,      // Water - at sea level
  1: 0.03,   // Beach - just barely above water
  2: 0.2,    // Jungle - noticeably elevated
  3: 0.45,   // Mountain - tall peaks
};

// Biome colors
const BIOME_COLORS: Record<Biome, string> = {
  SAND: "#e8d4a8",    // Pale yellow/tan (beach sand)
  GRASS: "#2d8a3e",   // Deep green (jungle)
  ROCK: "#6b6b6b",    // Grey (mountain rock)
};
const PORT_MARKER_RADIUS = 0.35;
const PORT_MARKER_HEIGHT = 0.3;
const WATER_HEX_OUTLINE_COLOR = "#ffffff";
const WATER_HEX_OUTLINE_OPACITY = 0.15;

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

// Create hex outline geometry for water hexes
function createHexOutlineGeometry(size: number): BufferGeometry {
  const vertices: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    vertices.push(size * Math.cos(angle), size * Math.sin(angle), 0);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  return geometry;
}

const hexOutlineGeometry = createHexOutlineGeometry(TILE_SIZE * 0.95);
const hexOutlineMaterial = new LineBasicMaterial({
  color: WATER_HEX_OUTLINE_COLOR,
  transparent: true,
  opacity: WATER_HEX_OUTLINE_OPACITY,
});

// Create geometries for each elevation level
const hexShape = createHexShape(TILE_SIZE);

// Get the depth (thickness) of a hex at given elevation
function getElevationDepth(elevation: Elevation): number {
  return HEX_BASE_DEPTH + ELEVATION_TOP_HEIGHTS[elevation];
}

// Get the Y position of the top surface of a hex
function getElevationTopY(elevation: Elevation): number {
  return ELEVATION_TOP_HEIGHTS[elevation];
}

// Pre-create geometries for each elevation level (0-3)
const elevationGeometries: Record<Elevation, ExtrudeGeometry> = {
  0: new ExtrudeGeometry(hexShape, { depth: getElevationDepth(0), bevelEnabled: false }),
  1: new ExtrudeGeometry(hexShape, { depth: getElevationDepth(1), bevelEnabled: false }),
  2: new ExtrudeGeometry(hexShape, { depth: getElevationDepth(2), bevelEnabled: false }),
  3: new ExtrudeGeometry(hexShape, { depth: getElevationDepth(3), bevelEnabled: false }),
};

// Default tile geometry for water (elevation 0)
const tileGeometry = elevationGeometries[0];

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
const tempColor = new Color();

// Decoration mesh component for trees, rocks, and forts
function DecorationMesh({ decoration, elevation = 1 }: { decoration: Decoration; elevation?: Elevation }) {
  const [x, y, z] = decoration.position;

  // Scale factor based on elevation (taller trees in jungle, bigger rocks on mountains)
  const elevationScale = elevation === 3 ? 1.3 : elevation === 2 ? 1.1 : 0.9;

  if (decoration.type === "tree") {
    // Trees are taller in jungle (elevation 2), shorter on beach (elevation 1)
    const treeScale = (decoration.scale ?? 1) * elevationScale;
    // Jungle trees are denser/greener
    const foliageColor = elevation === 2 ? "#1a6b2a" : "#228B22";

    return (
      <group position={[x, y, z]} rotation={[0, decoration.rotation, 0]} scale={treeScale}>
        {/* Trunk */}
        <mesh position={[0, 0.15, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.05, 0.3, 6]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>
        {/* Foliage */}
        <mesh position={[0, 0.4, 0]} castShadow>
          <coneGeometry args={[0.15, 0.4, 6]} />
          <meshStandardMaterial color={foliageColor} />
        </mesh>
      </group>
    );
  }

  if (decoration.type === "rock") {
    // Rocks are larger on mountains (elevation 3)
    const rockScale = (decoration.scale ?? 1) * elevationScale;
    // Mountain rocks are darker grey
    const rockColor = elevation === 3 ? "#4a4a4a" : "#696969";

    return (
      <mesh
        position={[x, y + 0.05, z]}
        rotation={[0, decoration.rotation, 0]}
        scale={rockScale}
        castShadow
      >
        <dodecahedronGeometry args={[0.08]} />
        <meshStandardMaterial color={rockColor} />
      </mesh>
    );
  }

  if (decoration.type === "fort") {
    return (
      <mesh position={[x, y + 0.1, z]} rotation={[0, decoration.rotation, 0]} castShadow>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshStandardMaterial color="#8B8682" />
      </mesh>
    );
  }

  if (decoration.type === "pier") {
    // Pier extends from port hex into adjacent water hex (~1.7 units between hex centers)
    const pierLength = 1.6;
    const pierWidth = 0.3;

    // Calculate slope angle to reach water level (y=0) from beach elevation
    // The parent group is at topY, so pier end needs to drop by topY
    const topY = getElevationTopY(elevation);
    const slopeAngle = -Math.atan(topY / pierLength); // Negative to slope down

    // Support post heights need to account for the slope - make them taller at far end
    const postHeight = 0.25;
    const getPostY = (zPos: number) => {
      // At z=0, post base at y=-postHeight/2; at z=pierLength, lower by topY
      const drop = (zPos / pierLength) * topY;
      return -postHeight / 2 - drop;
    };

    return (
      <group position={[x, y, z]} rotation={[0, decoration.rotation, 0]}>
        {/* Inner group for slope rotation around local X axis */}
        <group rotation={[slopeAngle, 0, 0]}>
          {/* Main pier deck - extends towards water */}
          <mesh position={[0, 0.02, pierLength / 2]} castShadow>
            <boxGeometry args={[pierWidth, 0.05, pierLength]} />
            <meshStandardMaterial color="#8B4513" />
          </mesh>
        </group>
        {/* Support posts - stay vertical, positioned along the slope */}
        <mesh position={[-0.1, getPostY(0.2), 0.2]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, postHeight, 6]} />
          <meshStandardMaterial color="#654321" />
        </mesh>
        <mesh position={[0.1, getPostY(0.2), 0.2]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, postHeight, 6]} />
          <meshStandardMaterial color="#654321" />
        </mesh>
        <mesh position={[-0.1, getPostY(0.8), 0.8]}>
          <cylinderGeometry args={[0.03, 0.03, postHeight, 6]} />
          <meshStandardMaterial color="#654321" />
        </mesh>
        <mesh position={[0.1, getPostY(0.8), 0.8]}>
          <cylinderGeometry args={[0.03, 0.03, postHeight, 6]} />
          <meshStandardMaterial color="#654321" />
        </mesh>
        <mesh position={[-0.1, getPostY(1.4), 1.4]}>
          <cylinderGeometry args={[0.03, 0.03, postHeight, 6]} />
          <meshStandardMaterial color="#654321" />
        </mesh>
        <mesh position={[0.1, getPostY(1.4), 1.4]}>
          <cylinderGeometry args={[0.03, 0.03, postHeight, 6]} />
          <meshStandardMaterial color="#654321" />
        </mesh>
      </group>
    );
  }

  return null;
}

// Port marker component with its own hover handling
function PortMarker({
  cell,
  onHover,
}: {
  cell: MapCell;
  onHover: (cell: MapCell | null) => void;
}) {
  const [x, , z] = hexToWorld(cell.hex);
  const elevation = cell.elevation ?? 1;
  const topY = getElevationTopY(elevation);

  return (
    <mesh
      position={[x, topY + PORT_MARKER_HEIGHT / 2 + 0.01, z]}
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
function PortLabel({ cell }: { cell: MapCell }) {
  const [x, , z] = hexToWorld(cell.hex);
  const elevation = cell.elevation ?? 1;
  const topY = getElevationTopY(elevation);

  if (!cell.portName) return null;

  return (
    <Text
      position={[x, topY + 0.6, z]}
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
  const landRef = useRef<InstancedMesh>(null!);
  const waterRef = useRef<InstancedMesh>(null!);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hoveredMeshType, setHoveredMeshType] = useState<"land" | "water" | null>(null);

  // Separate cells into water and land
  const { waterCells, landCells, waterIndexMap, landIndexMap } = useMemo(() => {
    const water: MapCell[] = [];
    const land: MapCell[] = [];
    const waterMap = new Map<number, number>(); // original index -> water index
    const landMap = new Map<number, number>(); // original index -> land index

    cells.forEach((cell, i) => {
      if (cell.terrain === "water" || cell.terrain === "reef") {
        waterMap.set(i, water.length);
        water.push(cell);
      } else {
        landMap.set(i, land.length);
        land.push(cell);
      }
    });

    return {
      waterCells: water,
      landCells: land,
      waterIndexMap: waterMap,
      landIndexMap: landMap,
    };
  }, [cells]);

  // Get all port cells for rendering markers
  const portCells = useMemo(() => cells.filter((c) => c.hasPort), [cells]);

  // Build target indices for both meshes
  const { targetWaterIndices, targetLandIndices, attackWaterIndices, attackLandIndices } = useMemo(() => {
    const targetWater = new Set<number>();
    const targetLand = new Set<number>();
    const attackWater = new Set<number>();
    const attackLand = new Set<number>();

    validTargets.forEach((t) => {
      const idx = cells.findIndex((c) => hexEquals(c.hex, t));
      if (idx !== -1) {
        if (waterIndexMap.has(idx)) targetWater.add(waterIndexMap.get(idx)!);
        if (landIndexMap.has(idx)) targetLand.add(landIndexMap.get(idx)!);
      }
    });

    attackTargets.forEach((t) => {
      const idx = cells.findIndex((c) => hexEquals(c.hex, t));
      if (idx !== -1) {
        if (waterIndexMap.has(idx)) attackWater.add(waterIndexMap.get(idx)!);
        if (landIndexMap.has(idx)) attackLand.add(landIndexMap.get(idx)!);
      }
    });

    return {
      targetWaterIndices: targetWater,
      targetLandIndices: targetLand,
      attackWaterIndices: attackWater,
      attackLandIndices: attackLand,
    };
  }, [cells, validTargets, attackTargets, waterIndexMap, landIndexMap]);

  const allWaterInteractive = useMemo(() => {
    const set = new Set<number>();
    targetWaterIndices.forEach((i) => set.add(i));
    attackWaterIndices.forEach((i) => set.add(i));
    return set;
  }, [targetWaterIndices, attackWaterIndices]);

  const allLandInteractive = useMemo(() => {
    const set = new Set<number>();
    targetLandIndices.forEach((i) => set.add(i));
    attackLandIndices.forEach((i) => set.add(i));
    return set;
  }, [targetLandIndices, attackLandIndices]);

  const hoveredCell = useMemo(() => {
    if (hoveredId === null || hoveredMeshType === null) return null;
    if (hoveredMeshType === "water") {
      if (!allWaterInteractive.has(hoveredId)) return null;
      return waterCells[hoveredId];
    } else {
      if (!allLandInteractive.has(hoveredId)) return null;
      return landCells[hoveredId];
    }
  }, [hoveredId, hoveredMeshType, allWaterInteractive, allLandInteractive, waterCells, landCells]);

  const isHoveredAttackTarget = useMemo(() => {
    if (hoveredId === null || hoveredMeshType === null) return false;
    if (hoveredMeshType === "water") return attackWaterIndices.has(hoveredId);
    return attackLandIndices.has(hoveredId);
  }, [hoveredId, hoveredMeshType, attackWaterIndices, attackLandIndices]);

  const attackTargetPositions = useMemo(() => {
    return attackTargets.map((t) => {
      const [x, y, z] = hexToWorld(t);
      return [x, y + 0.01, z] as [number, number, number];
    });
  }, [attackTargets]);

  // Set up land mesh (solid colored hexes with elevation-based height)
  useEffect(() => {
    const mesh = landRef.current;
    if (!mesh || landCells.length === 0) return;

    const colors = new Float32Array(landCells.length * 3);

    landCells.forEach((cell, i) => {
      const [x, , z] = hexToWorld(cell.hex);
      const elevation = cell.elevation ?? 1;
      const depth = getElevationDepth(elevation);
      const topY = getElevationTopY(elevation);

      // Position hex so the TOP is at elevation height above y=0
      // Geometry extrudes in +Z, rotation flips it to -Y, so top is at y position
      tempObject.position.set(x, topY, z);
      tempObject.rotation.set(-Math.PI / 2, 0, 0);
      // Scale Z to match elevation depth (becomes Y after rotation)
      tempObject.scale.set(1, 1, depth / HEX_BASE_DEPTH);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);

      // Color based on biome (or fallback to port/terrain color)
      let color: string;
      if (cell.hasPort) {
        color = portColor;
      } else if (cell.biome && BIOME_COLORS[cell.biome]) {
        color = BIOME_COLORS[cell.biome];
      } else {
        color = terrainColors[cell.terrain];
      }
      tempColor.set(color);
      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    });

    mesh.geometry.setAttribute("color", new InstancedBufferAttribute(colors, 3));
    mesh.instanceMatrix.needsUpdate = true;
  }, [landCells, terrainColors, portColor]);

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

  const handleLandPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!interactive) return;
      const id = e.instanceId;
      if (id !== undefined && allLandInteractive.has(id)) {
        e.stopPropagation();
        setHoveredId(id);
        setHoveredMeshType("land");
        document.body.style.cursor = attackLandIndices.has(id) ? "crosshair" : "pointer";
      } else {
        setHoveredId(null);
        setHoveredMeshType(null);
        document.body.style.cursor = "auto";
      }
    },
    [interactive, allLandInteractive, attackLandIndices]
  );

  const handleWaterPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!interactive) return;
      const id = e.instanceId;
      if (id !== undefined && allWaterInteractive.has(id)) {
        e.stopPropagation();
        setHoveredId(id);
        setHoveredMeshType("water");
        document.body.style.cursor = attackWaterIndices.has(id) ? "crosshair" : "pointer";
      } else {
        setHoveredId(null);
        setHoveredMeshType(null);
        document.body.style.cursor = "auto";
      }
    },
    [interactive, allWaterInteractive, attackWaterIndices]
  );

  const handlePointerOut = useCallback(() => {
    setHoveredId(null);
    setHoveredMeshType(null);
    document.body.style.cursor = "auto";
  }, []);

  const handleLandClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!interactive) return;
      const id = e.instanceId;
      if (id !== undefined && allLandInteractive.has(id)) {
        e.stopPropagation();
        onHexClick(landCells[id].hex);
      }
    },
    [interactive, allLandInteractive, onHexClick, landCells]
  );

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

  const hoveredPos = useMemo(() => {
    if (!hoveredCell) return null;
    const [x, y, z] = hexToWorld(hoveredCell.hex);
    return [x, y + 0.01, z] as [number, number, number];
  }, [hoveredCell]);

  return (
    <>
      {/* Land hexes - visible solid meshes */}
      {landCells.length > 0 && (
        <instancedMesh
          ref={landRef}
          args={[tileGeometry, undefined, landCells.length]}
          onPointerMove={handleLandPointerMove}
          onPointerOut={handlePointerOut}
          onClick={handleLandClick}
          frustumCulled={false}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial vertexColors />
        </instancedMesh>
      )}

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

      {/* Water hex wireframe outlines */}
      {waterCells.map((cell) => {
        const [x, y, z] = hexToWorld(cell.hex);
        return (
          <primitive
            key={`outline-${cell.hex.q}-${cell.hex.r}`}
            object={new LineLoop(hexOutlineGeometry, hexOutlineMaterial)}
            position={[x, y + 0.01, z]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        );
      })}

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

      {/* Decorations on island hexes (positioned at elevation height) */}
      {cells
        .filter((cell) => cell.decorations && cell.decorations.length > 0)
        .map((cell) => {
          const [x, , z] = hexToWorld(cell.hex);
          // Y position at top of hex based on elevation
          const elevation = cell.elevation ?? 1;
          const topY = getElevationTopY(elevation);
          return (
            <group key={`deco-${cell.hex.q}-${cell.hex.r}`} position={[x, topY, z]}>
              {cell.decorations!.map((deco, i) => (
                <DecorationMesh key={i} decoration={deco} elevation={elevation} />
              ))}
            </group>
          );
        })}

      {/* Floating port name labels */}
      {portCells.map((cell) => (
        <PortLabel key={`label-${cell.hex.q}-${cell.hex.r}`} cell={cell} />
      ))}
    </>
  );
}
