import { useRef, useEffect, useCallback } from "react";
import {
  Shape,
  ExtrudeGeometry,
  InstancedMesh,
  Object3D,
  CylinderGeometry,
  PerspectiveCamera,
  Vector3,
} from "three";
import type { Camera, Group, Mesh } from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { CAMERA_FOV } from "./cameraBounds";
import {
  PORT_LABEL_FONT_SIZE,
  PORT_LABEL_MIN_HEIGHT,
  portLabelLiftOver,
  portLabelOpacity,
  portLabelScale,
  portLabelScreenShift,
  portLabelViewPitch,
} from "./visuals/portLabel";
import { hexEquals, hexToWorld } from "../game/hex";
import type { MapCell } from "../game/types";
import { WaterHexOutlines } from "./WaterHexOutlines";
import { waterPointerMove, waterPointerOut } from "./waterHover";
import type { HexGridState, PortSite } from "./useHexGrid";
import { PORT_HOVER_RADIUS } from "./visuals/portHover";

const TILE_SIZE = 1;
const HEX_BASE_DEPTH = 0.1;
const HIGHLIGHT_DEPTH = 0.02;

// The port's hover volume (#59): invisible, covering the settlement's whole
// envelope (every building's farthest corner in plan, and from the lowest
// foot to the tallest top in height: `portHover.ts`), so a pointer over any
// part of a building or the ground between them shows the tooltip. The
// buildings themselves are the port's visual (portSettlement.ts).

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

// Hover volume for a port: never drawn, raycast only. Unit height, scaled to each site's volume.
const portHoverGeometry = new CylinderGeometry(PORT_HOVER_RADIUS, PORT_HOVER_RADIUS, 1, 8);

const tempObject = new Object3D();
const labelBase = new Vector3();
const labelPoint = new Vector3();
// Height of the label's text block in ems (troika's "normal" line height), for where its top is drawn
const LABEL_LINE_HEIGHT = 1.2;


// Port hover volume: an invisible cylinder over the settlement (`visible`
// false keeps it out of the draw and shadow passes; R3F still raycasts it,
// as with the water hexes below).
function PortMarker({
  site: { cell, hover },
  onHover,
}: {
  site: PortSite;
  onHover: (cell: MapCell | null) => void;
}) {
  const [x, , z] = hexToWorld(cell.hex);

  return (
    <mesh
      position={[x, (hover.bottom + hover.top) / 2, z]}
      scale={[1, hover.top - hover.bottom, 1]}
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

/** The troika text mesh behind drei's `Text`, with the opacities it reads each frame. */
type LabelText = Mesh & { fillOpacity: number; outlineOpacity: number };

/** CSS pixels down from the viewport's top at which world point `p` is drawn (`p` is overwritten). */
function screenY(p: Vector3, camera: Camera, viewportHeight: number): number {
  return ((1 - p.project(camera).y) / 2) * viewportHeight;
}

// Floating port name label over its town: lifted clear of the settlement as
// the camera sees it, turned to face the camera, its screen size held between
// a readable minimum and a cap, faded close in, back to full on hover, and
// kept inside the top of the screen (#75, #151, visuals/portLabel.ts)
function PortLabel({ site: { cell, groundY, labelAnchor, ownBuildings }, hovered }: { site: PortSite; hovered: boolean }) {
  const { x, z } = labelAnchor;
  const groupRef = useRef<Group>(null);
  const textRef = useRef<LabelText>(null);

  useFrame(({ camera, size }) => {
    const group = groupRef.current;
    const text = textRef.current;
    if (!group?.parent || !text) return;
    // World positions, so each world copy (#36) measures its own label
    const copy = group.parent;
    // The lift for the pitch the camera really looks down at the town
    const groundPitch = portLabelViewPitch(camera.position, copy.localToWorld(labelBase.set(x, groundY, z)));
    const labelBaseY = portLabelLiftOver(labelAnchor, groundY, ownBuildings, groundPitch);
    copy.localToWorld(labelBase.set(x, labelBaseY, z));
    const distance = camera.position.distanceTo(labelBase);
    const fov = camera instanceof PerspectiveCamera ? camera.fov : CAMERA_FOV;
    const scale = portLabelScale(distance, fov, size.height);
    group.scale.setScalar(scale);
    // Turned about the baseline to face the camera, not foreshortened by the look down
    const pitch = portLabelViewPitch(camera.position, labelBase);
    group.rotation.x = -pitch;
    const glyphHeight = PORT_LABEL_FONT_SIZE * LABEL_LINE_HEIGHT * scale;
    const opacity = portLabelOpacity(distance, hovered);
    text.fillOpacity = opacity;
    text.outlineOpacity = opacity;
    // Gone at town zoom (#90): skip drawing it at all
    group.visible = opacity > 0;

    // Bring the label back inside the top edge if the lift carried it off
    const shift = portLabelScreenShift({
      baselineY: screenY(labelPoint.copy(labelBase), camera, size.height),
      topY: screenY(
        // The glyphs' top, up the turned label: (0, cos p, -sin p)
        labelPoint.set(labelBase.x, labelBase.y + glyphHeight * Math.cos(pitch), labelBase.z - glyphHeight * Math.sin(pitch)),
        camera,
        size.height
      ),
      portY: screenY(copy.localToWorld(labelPoint.set(x, groundY, z)), camera, size.height),
    });
    if (shift > 0) {
      // Same depth, `shift` pixels lower on screen
      labelPoint.copy(labelBase).project(camera);
      labelPoint.y -= (2 * shift) / size.height;
      copy.worldToLocal(labelPoint.unproject(camera));
      group.position.copy(labelPoint);
    } else {
      group.position.set(x, labelBaseY, z);
    }
  });

  if (!cell.portName) return null;

  return (
    <group ref={groupRef} position={[x, groundY + PORT_LABEL_MIN_HEIGHT, z]}>
      <Text
        ref={textRef}
        // Facing +z, square on to the camera, which looks due north (cameraBounds.ts); the group tilts it back to face the camera
        rotation={[0, 0, 0]}
        fontSize={PORT_LABEL_FONT_SIZE}
        color="#fef3c7"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.02}
        outlineColor="#1c1917"
        raycast={() => null}
      >
        {cell.portName}
      </Text>
    </group>
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
    onMiss,
    onPortHover,
    hoveredPort,
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
      const id = e.instanceId;
      if (id === undefined) return;
      // The sea hover follows the pointer always; the target hover only while interactive (#239)
      setHover((h) => waterPointerMove(h, id, copy, allWaterInteractive, interactive));
      if (!interactive) return;
      if (allWaterInteractive.has(id)) {
        e.stopPropagation();
        document.body.style.cursor = attackWaterIndices.has(id) ? "crosshair" : "pointer";
      } else {
        document.body.style.cursor = "auto";
      }
    },
    [interactive, allWaterInteractive, attackWaterIndices, setHover, copy]
  );

  const handlePointerOut = useCallback(() => {
    setHover((h) => waterPointerOut(h, copy));
    document.body.style.cursor = "auto";
  }, [setHover, copy]);

  const handleWaterClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!interactive) return;
      const id = e.instanceId;
      if (id !== undefined && allWaterInteractive.has(id)) {
        e.stopPropagation();
        onHexClick(waterCells[id].hex);
      } else {
        onMiss?.();
      }
    },
    [interactive, allWaterInteractive, onHexClick, onMiss, waterCells]
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
        <PortLabel
          key={`label-${site.cell.hex.q}-${site.cell.hex.r}`}
          site={site}
          hovered={hoveredPort !== null && hexEquals(hoveredPort.hex, site.cell.hex)}
        />
      ))}
    </>
  );
}
