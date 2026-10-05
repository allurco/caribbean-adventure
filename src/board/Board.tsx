import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import { Vector3, PCFSoftShadowMap } from "three";
import type { MapControls as MapControlsType } from "three-stdlib";
import { EffectComposer, Bloom, Vignette, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { BoardProps } from "boardgame.io/react";
import type { CaribbeanState } from "../game/Game";
import { getMaxMoves } from "../game/Game";
import type { Hex } from "../game/hex";
import type { ShipState, ShipClass, NPCShip, MapCell } from "../game/types";
import { hexToWorld, hexEquals, wrapWorldWidth } from "../game/hex";
import { validMoveTargets, findAccessiblePort } from "../game/moves";
import { getValidAttackTargets, getValidNPCAttackTargets } from "../game/combat";
import { getValidScoutTargets } from "../game/scouting";
import { getMapPreset, computeCameraConfig } from "../game/mapConfig";
import { HexGrid } from "./HexGrid";
import { useHexGrid } from "./useHexGrid";
import { Ocean } from "./visuals/Ocean";
import { LandTerrain } from "./visuals/LandTerrain";
import { useLandTerrain } from "./visuals/useLandTerrain";
import { TerrainDecorations } from "./visuals/TerrainDecorations";
import { useDecorationLayout } from "./visuals/useDecorationLayout";
import { SunLight } from "./visuals/SunLight";
import { useSkyEnvironment } from "./visuals/useSkyEnvironment";
import { useWaveCascades } from "./visuals/useWaveCascades";
import { WAVE_CASCADES } from "./visuals/oceanWaves";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import {
  HAZE_COLOR,
  HAZE_NEAR,
  HAZE_FAR,
  SUN_COLOR,
  SUN_DIRECTION,
  SUN_INTENSITY,
  SUN_OFFSET,
  SHADOW_MAP_SIZE,
  SHADOW_EXTENT,
  BLOOM_INTENSITY,
  BLOOM_THRESHOLD,
  BLOOM_SMOOTHING,
  VIGNETTE_DARKNESS,
  VIGNETTE_OFFSET,
} from "./visuals/atmosphere";
import {
  CAMERA_BOUNDS_PADDING,
  CAMERA_FOV,
  CAMERA_MAX_DISTANCE,
  CAMERA_OFFSET,
  CAMERA_PITCH,
  MAX_VIEW_ASPECT,
  cameraBoundsFromHexes,
  clampToCameraBounds,
  groundViewReach,
  oceanPlaneSize,
} from "./cameraBounds";
import {
  clampFocusZ,
  groundFootprint,
  mapBand,
  maxViewDistance,
  seamAwareStart,
  wrapCopyRange,
} from "./wrapView";
import { seamStrip } from "./visuals/seamStrip";
import { PointerCopy, WorldCopies } from "./WorldCopies";
import { Ship, SinkingShip } from "./Ship";
import { ShipTooltip } from "./ShipTooltip";
import { PortTooltip } from "./PortTooltip";
import { ShipDetailsPanel } from "./ShipDetailsPanel";
import { PortPanel } from "./PortPanel";
import { DraftScreen } from "./DraftScreen";
import { HudCaptainCard } from "./HudCaptainCard";
import { HudShipCard } from "./HudShipCard";
import { HudTurnBar } from "./HudTurnBar";
import { CombatPanel } from "./CombatPanel";
import { GameOverScreen } from "./GameOverScreen";
import { DockingAnimation } from "./DockingAnimation";
import { TurnChangeAnimation } from "./TurnChangeAnimation";
import { MissionCompleteToast } from "./MissionCompleteToast";
import type { Mission } from "../game/types";

interface SinkingShipData {
  id: string;
  position: [number, number, number];
  color: string;
  shipClass?: ShipClass;
}

const PLAYER_COLORS: Record<string, string> = {
  "0": "#3b82f6", // blue
  "1": "#ef4444", // red
};

const NPC_MERCHANT_COLOR = "#d4a574"; // tan/beige for merchant ships
const NPC_FLOTILLA_COLOR = "#8b0000"; // dark red for military/flotilla ships

/**
 * World units past the edge of the view that copies of a wrapping world still
 * cover: things poke out of their strip by up to about a hex (a ship sailing
 * across the seam starts a column outside it), plus a hex for tall islands
 * and labels seen at an angle.
 */
const WRAP_COPY_MARGIN = 3;

function Scene({
  G,
  currentPlayer,
  cam,
  movesRemaining,
  attackMode,
  spyglassMode,
  attackTargetHexes,
  spyglassTargetHexes,
  sinkingShips,
  npcs,
  hoveredShipId,
  hoveredPort,
  scoutedPlayerIds,
  focusPosition,
  onMoveShip,
  onHexClick,
  onSinkingComplete,
  onShipHover,
  onShipClick,
  onPortHover,
}: {
  G: CaribbeanState;
  currentPlayer: string;
  cam: { isoDistance: number; target: [number, number, number] };
  movesRemaining: number;
  attackMode: boolean;
  spyglassMode: boolean;
  attackTargetHexes: Hex[];
  spyglassTargetHexes: Hex[];
  sinkingShips: SinkingShipData[];
  npcs: Record<string, NPCShip>;
  hoveredShipId: string | null;
  hoveredPort: MapCell | null;
  scoutedPlayerIds: string[];
  focusPosition: [number, number, number] | null;
  onMoveShip: (q: number, r: number) => void;
  onHexClick: (hex: Hex) => void;
  onSinkingComplete: (id: string) => void;
  onShipHover: (id: string | null) => void;
  onShipClick: (id: string) => void;
  onPortHover: (cell: MapCell | null) => void;
}) {
  const currentShipState = G.ships[currentPlayer];
  const controlsRef = useRef<MapControlsType>(null);
  const { camera } = useThree();
  const targetPosition = useRef(new Vector3());
  const isAnimating = useRef(false);
  // Physical sky as image-based lighting for the whole scene (replaces the old
  // hemisphere and fill lights) and as the sea's reflection.
  const skyEnvironment = useSkyEnvironment(SUN_DIRECTION);
  // The sea's wave slopes, rebuilt on the GPU each frame (frozen under
  // reduced motion). The water shades its surface with them and the seabed
  // focuses its sunlight through them (#38 step 6), so they live here.
  const reducedMotion = usePrefersReducedMotion();
  const waveSlopes = useWaveCascades(WAVE_CASCADES, reducedMotion);

  const cameraBounds = useMemo(
    () => cameraBoundsFromHexes(G.cells.map((c) => c.hex), CAMERA_BOUNDS_PADDING),
    [G.cells]
  );

  // East–west wrap (#36): the world is drawn in copies one wrap width apart
  // that follow the camera, which pans east or west forever; north and south
  // the view stops at the top and bottom rows of hexes.
  const strip = useMemo(() => seamStrip(G.wrap), [G.wrap]);
  const period = wrapWorldWidth(G.wrap);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const footprint = useMemo(() => groundFootprint(CAMERA_OFFSET, CAMERA_FOV, aspect), [aspect]);
  const band = useMemo(() => mapBand(getMapPreset(G.mapSize).rows), [G.mapSize]);
  // The furthest zoom-out at which the whole view still fits between the top
  // and bottom rows; recomputed when the window's shape changes.
  const maxDistance = strip && footprint ? maxViewDistance(footprint, band, CAMERA_MAX_DISTANCE) : CAMERA_MAX_DISTANCE;
  const copies = useMemo(
    () => (strip && footprint ? wrapCopyRange(footprint, maxDistance, period, WRAP_COPY_MARGIN) : { from: 0, to: 0 }),
    [strip, footprint, maxDistance, period]
  );


  // The ocean is a finite square centred under the camera focus, so its edge
  // must stay off screen. Fog alone can't hide it: at full zoom-out the top
  // corners of the view hit the sea only ~46 units deep, well short of
  // HAZE_FAR (85). From the focus the frustum reaches at most
  // `groundViewReach` across the sea (fixed pitch since rotation is off, max
  // zoom, widest aspect), so a plane that far out on every side covers it.
  const oceanSize = oceanPlaneSize(
    groundViewReach(CAMERA_MAX_DISTANCE, CAMERA_PITCH, CAMERA_FOV, MAX_VIEW_ASPECT)
  );

  /** The focus nearest (x, z) the camera may have at `distance`: x as is on a wrapping map. */
  const clampFocus = useCallback(
    (x: number, z: number, distance: number): { x: number; z: number } => {
      if (strip && footprint) return { x, z: clampFocusZ(z, distance, footprint, band) };
      const clamped = clampToCameraBounds(cameraBounds, x, z);
      return { x: clamped.x, z: clamped.z };
    },
    [strip, footprint, band, cameraBounds]
  );

  // Keep the view over the map: after every MapControls update (pan, zoom,
  // damping, focus-lerp) pull the target back inside the bounds and move the
  // camera by the same delta, so the view angle and zoom are unchanged.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const correction = new Vector3();
    const clamp = () => {
      const { x, z } = clampFocus(controls.target.x, controls.target.z, camera.position.distanceTo(controls.target));
      const dx = x - controls.target.x;
      const dz = z - controls.target.z;
      if (dx === 0 && dz === 0) return;
      correction.set(dx, 0, dz);
      controls.target.add(correction);
      camera.position.add(correction);
    };
    // A new zoom limit (window resized) applies on the controls' next update.
    controls.update();
    clamp();
    controls.addEventListener("change", clamp);
    return () => controls.removeEventListener("change", clamp);
  }, [clampFocus, camera, maxDistance]);

  // Animate camera to focus position when it changes
  useEffect(() => {
    if (focusPosition && controlsRef.current) {
      targetPosition.current.set(focusPosition[0], 0, focusPosition[2]);
      isAnimating.current = true;
    }
  }, [focusPosition]);

  // Smooth camera animation
  useFrame(() => {
    if (isAnimating.current && controlsRef.current) {
      const controls = controlsRef.current;
      const target = controls.target;

      // Aim for the clamped focus so the lerp can actually arrive, going the
      // short way round on a wrapping map
      const goal = targetPosition.current;
      const { x, z } = clampFocus(
        seamAwareStart(goal.x, target.x, period),
        goal.z,
        camera.position.distanceTo(target)
      );
      goal.set(x, 0, z);

      // Lerp towards target
      target.lerp(targetPosition.current, 0.08);

      // Also move camera position to follow
      const offset = new Vector3().subVectors(camera.position, target);
      const newCamPos = targetPosition.current.clone().add(offset);
      camera.position.lerp(newCamPos, 0.08);

      // Stop animating when close enough
      if (target.distanceTo(targetPosition.current) < 0.1) {
        isAnimating.current = false;
      }

      controls.update();
    }
  });

  // Collect all blocking positions: other players + NPCs
  const otherShipPositions = useMemo(
    () => [
      ...Object.entries(G.ships)
        .filter(([id]) => id !== currentPlayer)
        .map(([, s]) => s.position),
      ...Object.values(npcs).map((n) => n.position),
    ],
    [G.ships, currentPlayer, npcs]
  );
  const targets = useMemo(() => {
    if (!currentShipState) return [];
    const shallowDraft = currentShipState.stats?.shallowDraft ?? true;
    return validMoveTargets(
      currentShipState.position,
      G.cells,
      G.wrap,
      otherShipPositions,
      shallowDraft
    );
  }, [currentShipState, G.cells, G.wrap, otherShipPositions]);

  // Built once per map (and turn) and drawn by every copy of the world: the
  // copies share these geometries, materials and hover state.
  const landTerrain = useLandTerrain(G.cells, G.wrap, { sun: SUN_DIRECTION, waveSlopes });
  const decorations = useDecorationLayout(G.cells, G.wrap);
  const grid = useHexGrid({
    cells: G.cells,
    wrap: G.wrap,
    validTargets: attackMode || spyglassMode ? [] : movesRemaining > 0 ? targets : [],
    attackTargets: attackMode ? attackTargetHexes : spyglassMode ? spyglassTargetHexes : [],
    onHexClick: (h) => {
      if (attackMode || spyglassMode) {
        onHexClick(h);
      } else {
        onMoveShip(h.q, h.r);
      }
    },
    onPortHover,
    interactive: attackMode || spyglassMode || movesRemaining > 0,
  });

  return (
    <>
      {/* Horizon haze: background matches the fog so the far edge dissolves */}
      <color attach="background" args={[HAZE_COLOR]} />
      <fog attach="fog" args={[HAZE_COLOR, HAZE_NEAR, HAZE_FAR]} />

      {/* High, warm mid-afternoon sun in front of the camera; shadow box follows the camera target */}
      <SunLight
        color={SUN_COLOR}
        intensity={SUN_INTENSITY}
        offset={SUN_OFFSET}
        shadowMapSize={SHADOW_MAP_SIZE}
        shadowExtent={SHADOW_EXTENT}
      />

      {/* Ocean, coloured by depth from the same terrain height field, under
          the camera focus and sized so its edge is never on screen. One plane
          for every copy of the world. Waits for the sky it reflects. */}
      {skyEnvironment && (
        <Ocean
          cells={G.cells}
          wrap={G.wrap}
          size={oceanSize}
          sun={SUN_DIRECTION}
          sunColor={SUN_COLOR}
          sunIntensity={SUN_INTENSITY}
          sky={skyEnvironment.texture}
          skyHeight={skyEnvironment.textureHeight}
          skyIntensity={skyEnvironment.intensity}
          waveSlopes={waveSlopes}
        />
      )}

      {/* Everything on the map, once per copy of the wrapping world */}
      <WorldCopies period={period} stripMinX={strip?.minX ?? 0} from={copies.from} to={copies.to}>
      {(copy) => (
      <>
      {/* Islands: one continuous mesh from the terrain height field */}
      <LandTerrain terrain={landTerrain} />

      {/* Terrain decorations: trees, rocks, forts, piers */}
      <TerrainDecorations layout={decorations} />

      <HexGrid grid={grid} copy={copy} />

      {Object.entries(G.ships).map(([id, ship]) => (
        <Ship
          key={id}
          position={hexToWorld(ship.position)}
          color={PLAYER_COLORS[id] ?? "#888888"}
          shipClass={ship.shipClass}
          wrapWidth={period}
          onPointerEnter={() => onShipHover(id)}
          onPointerLeave={() => onShipHover(null)}
          onClick={() => onShipClick(id)}
        />
      ))}

      {/* NPC Ships */}
      {Object.values(npcs).map((npc) => (
        <Ship
          key={npc.id}
          position={hexToWorld(npc.position)}
          color={npc.role === "FLOTILLA" ? NPC_FLOTILLA_COLOR : NPC_MERCHANT_COLOR}
          shipClass={npc.shipClass}
          wrapWidth={period}
          onPointerEnter={() => onShipHover(npc.id)}
          onPointerLeave={() => onShipHover(null)}
          onClick={() => onShipClick(npc.id)}
        />
      ))}

      {sinkingShips.map((ship) => (
        <SinkingShip
          key={`sinking-${ship.id}`}
          position={ship.position}
          color={ship.color}
          shipClass={ship.shipClass}
          onComplete={() => onSinkingComplete(ship.id)}
        />
      ))}
      </>
      )}
      </WorldCopies>

      {/* Ship Tooltip, once, in the copy under the pointer */}
      {hoveredShipId && (G.ships[hoveredShipId] || npcs[hoveredShipId]) && (() => {
        const position = hexToWorld(G.ships[hoveredShipId]?.position ?? npcs[hoveredShipId]?.position);
        return (
        <PointerCopy x={position[0]} period={period}>
        <ShipTooltip
          position={position}
          ship={G.ships[hoveredShipId] ?? npcs[hoveredShipId]}
          isNPC={!!npcs[hoveredShipId]}
          isPlayer={hoveredShipId === currentPlayer}
          playerIndex={G.ships[hoveredShipId] ? hoveredShipId : undefined}
          isScouted={
            npcs[hoveredShipId]
              ? npcs[hoveredShipId].isIdentified
              : scoutedPlayerIds.includes(hoveredShipId)
          }
          canScout={spyglassTargetHexes.some((h) =>
            hexEquals(
              h,
              G.ships[hoveredShipId]?.position ?? npcs[hoveredShipId]?.position
            )
          )}
        />
        </PointerCopy>
        );
      })()}

      {/* Port Tooltip, likewise */}
      {hoveredPort && !hoveredShipId && G.ships[currentPlayer] && (
        <PointerCopy x={hexToWorld(hoveredPort.hex)[0]} period={period}>
        <PortTooltip
          position={hexToWorld(hoveredPort.hex)}
          nation={hoveredPort.nation}
          portName={hoveredPort.portName}
          hasShipyard={hoveredPort.hasShipyard}
          ship={G.ships[currentPlayer]}
          market={hoveredPort.market}
        />
        </PointerCopy>
      )}

      <MapControls
        ref={controlsRef}
        makeDefault
        // Look at the middle of the map from the first frame: the rectangle's
        // corner, not its centre, is the world origin. It must be a prop, not
        // set in an effect: the controls' first update runs before effects, and
        // with the target still at the origin it pulls the camera (placed over
        // the centre, beyond maxDistance) to within maxDistance of the corner,
        // so re-aiming at the centre afterwards leaves the camera on the far
        // side, looking back across the map (labels read mirrored).
        target={cam.target}
        enableRotate={false}
        minDistance={Math.min(cam.isoDistance * 0.15, maxDistance)}
        maxDistance={maxDistance}
      />

      {/* Post-processing effects */}
      <EffectComposer>
        <Bloom
          intensity={BLOOM_INTENSITY}
          luminanceThreshold={BLOOM_THRESHOLD}
          luminanceSmoothing={BLOOM_SMOOTHING}
        />
        <Vignette darkness={VIGNETTE_DARKNESS} offset={VIGNETTE_OFFSET} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}

export function CaribbeanBoard(props: BoardProps<CaribbeanState>) {
  const { G, ctx } = props;
  const [attackMode, setAttackMode] = useState(false);
  const [spyglassMode, setSpyglassMode] = useState(false);
  const [sinkingShips, setSinkingShips] = useState<SinkingShipData[]>([]);
  const [hoveredShipId, setHoveredShipId] = useState<string | null>(null);
  const [hoveredPort, setHoveredPort] = useState<MapCell | null>(null);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [dockingPort, setDockingPort] = useState<MapCell | null>(null);
  const [showTurnChange, setShowTurnChange] = useState(false);
  const [completedMission, setCompletedMission] = useState<Mission | null>(null);
  const [cameraFocusPosition, setCameraFocusPosition] = useState<[number, number, number] | null>(null);

  const currentPlayer = ctx.currentPlayer;
  const currentShipState = G.ships[currentPlayer];

  // Track previous player to detect turn changes
  const prevPlayerRef = useRef<string | null>(null);

  // Track previous mission to detect completion (includes player ID to avoid false triggers on turn change)
  const prevMissionRef = useRef<{ mission: Mission | undefined; playerId: string } | null>(null);

  // Track previous port to detect new docking
  const prevPortRef = useRef<string | null>(null);

  // Detect ships that were removed (sunk)
  // Use a ref to track previous ship IDs without causing re-renders
  const prevShipIdsRef = useRef<Set<string>>(new Set(Object.keys(G.ships)));
  const prevShipSnapshotsRef = useRef<Record<string, ShipState>>(G.ships);

  useEffect(() => {
    const currentIds = Object.keys(G.ships);
    const currentIdSet = new Set(currentIds);
    const prevIds = prevShipIdsRef.current;
    const prevSnapshots = prevShipSnapshotsRef.current;

    // Find ships that were removed
    const removedIds: string[] = [];
    prevIds.forEach((id) => {
      if (!currentIdSet.has(id) && prevSnapshots[id]) {
        removedIds.push(id);
      }
    });

    if (removedIds.length > 0) {
      const newSinking = removedIds.map((id) => ({
        id,
        position: hexToWorld(prevSnapshots[id].position),
        color: PLAYER_COLORS[id] ?? "#888888",
        shipClass: prevSnapshots[id].shipClass,
      }));

      setSinkingShips((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const toAdd = newSinking.filter((s) => !existingIds.has(s.id));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
    }

    // Update refs for next comparison
    prevShipIdsRef.current = currentIdSet;
    prevShipSnapshotsRef.current = G.ships;
  }, [G.ships]);

  // Detect when current player docks at a new port
  useEffect(() => {
    if (!currentShipState || ctx.phase === "draft") return;

    const accessiblePort = findAccessiblePort(currentShipState.position, G.cells, G.wrap);
    const currentPortId = accessiblePort?.portName ?? null;
    const prevPortId = prevPortRef.current;

    // If we just arrived at a new port (different from previous)
    if (currentPortId && currentPortId !== prevPortId && accessiblePort) {
      // Defer to avoid synchronous setState in effect
      const timer = setTimeout(() => setDockingPort(accessiblePort), 0);
      prevPortRef.current = currentPortId;
      return () => clearTimeout(timer);
    }

    prevPortRef.current = currentPortId;
  }, [currentShipState?.position, G.cells, G.wrap, ctx.phase, currentShipState]);

  // Detect turn changes
  useEffect(() => {
    if (ctx.phase === "draft") return;

    const prevPlayer = prevPlayerRef.current;

    // If player changed and we have a previous player (not first load)
    if (currentPlayer !== prevPlayer && prevPlayer !== null) {
      const timer = setTimeout(() => {
        setShowTurnChange(true);
        // Focus camera on new player's ship
        if (currentShipState) {
          const worldPos = hexToWorld(currentShipState.position);
          setCameraFocusPosition(worldPos);
        }
      }, 0);
      prevPlayerRef.current = currentPlayer;
      return () => clearTimeout(timer);
    }

    prevPlayerRef.current = currentPlayer;
  }, [currentPlayer, ctx.phase, currentShipState]);

  // Detect mission completion
  useEffect(() => {
    const prev = prevMissionRef.current;
    const currentMission = currentShipState?.activeMission;

    // Only detect completion if we're still the same player
    // This prevents false triggers when turn changes to a different player
    if (
      prev &&
      prev.playerId === currentPlayer &&
      prev.mission &&
      prev.mission.status === "ACTIVE" &&
      !currentMission
    ) {
      const completedMissionData = prev.mission;
      const timer = setTimeout(() => {
        setCompletedMission({ ...completedMissionData, status: "COMPLETED" });
      }, 0);
      prevMissionRef.current = { mission: currentMission, playerId: currentPlayer };
      return () => clearTimeout(timer);
    }

    prevMissionRef.current = { mission: currentMission, playerId: currentPlayer };
  }, [currentShipState?.activeMission, currentPlayer]);

  const handleSinkingComplete = (id: string) => {
    setSinkingShips((prev) => prev.filter((s) => s.id !== id));
  };

  // Calculate potential attack targets (players + NPCs) - must be before early return
  const attackTargetIds = useMemo(() => {
    if (!currentShipState) return [];
    return getValidAttackTargets(currentShipState, G.ships, currentPlayer, G.wrap);
  }, [currentShipState, G.ships, currentPlayer, G.wrap]);

  const npcAttackTargetIds = useMemo(() => {
    if (!currentShipState) return [];
    return getValidNPCAttackTargets(currentShipState, G.npcs, G.wrap);
  }, [currentShipState, G.npcs, G.wrap]);

  const attackTargetHexes = useMemo(() => {
    const playerHexes = attackTargetIds.map((id) => G.ships[id]?.position).filter(Boolean) as Hex[];
    const npcHexes = npcAttackTargetIds.map((id) => G.npcs[id]?.position).filter(Boolean) as Hex[];
    return [...playerHexes, ...npcHexes];
  }, [attackTargetIds, npcAttackTargetIds, G.ships, G.npcs]);

  const hasAttackTargets = attackTargetIds.length > 0 || npcAttackTargetIds.length > 0;

  // Calculate spyglass targets
  const spyglassTargets = useMemo(() => {
    if (!currentShipState) return { players: [], npcs: [] };
    return getValidScoutTargets(currentShipState, currentPlayer, G.ships, G.npcs, G.wrap);
  }, [currentShipState, currentPlayer, G.ships, G.npcs, G.wrap]);

  const spyglassTargetHexes = useMemo(() => {
    const playerHexes = spyglassTargets.players.map((id) => G.ships[id]?.position).filter(Boolean) as Hex[];
    const npcHexes = spyglassTargets.npcs.map((id) => G.npcs[id]?.position).filter(Boolean) as Hex[];
    return [...playerHexes, ...npcHexes];
  }, [spyglassTargets, G.ships, G.npcs]);

  const hasSpyglassTargets = spyglassTargets.players.length > 0 || spyglassTargets.npcs.length > 0;

  if (ctx.phase === "draft") {
    return (
      <DraftScreen
        G={G}
        currentPlayer={ctx.currentPlayer}
        onPickCaptain={(index, shipClass) =>
          props.moves.pickCaptain(index, shipClass)
        }
      />
    );
  }

  const preset = getMapPreset(G.mapSize);
  const cam = computeCameraConfig(preset);
  const maxMoves = currentShipState ? getMaxMoves(currentShipState) : 0;
  const movesRemaining = maxMoves - (ctx.numMoves ?? 0);

  const inCombat = ctx.phase === "combat" && G.combat;

  const handleHexClickForAttack = (hex: Hex) => {
    // First check if it's a player ship
    const targetEntry = Object.entries(G.ships).find(
      ([id, ship]) => id !== currentPlayer && hexEquals(ship.position, hex)
    );
    if (targetEntry) {
      props.moves.attackShip(targetEntry[0]);
      setAttackMode(false);
      return;
    }

    // Then check if it's an NPC
    const npcEntry = Object.entries(G.npcs).find(
      ([, npc]) => hexEquals(npc.position, hex)
    );
    if (npcEntry) {
      props.moves.attackNPC(npcEntry[0]);
      setAttackMode(false);
    }
  };

  const handleHexClickForSpyglass = (hex: Hex) => {
    // First check if it's a player ship
    const targetEntry = Object.entries(G.ships).find(
      ([id, ship]) => id !== currentPlayer && hexEquals(ship.position, hex)
    );
    if (targetEntry) {
      props.moves.spyglass(targetEntry[0], false);
      setSpyglassMode(false);
      return;
    }

    // Then check if it's an NPC
    const npcEntry = Object.entries(G.npcs).find(
      ([, npc]) => hexEquals(npc.position, hex)
    );
    if (npcEntry) {
      props.moves.spyglass(npcEntry[0], true);
      setSpyglassMode(false);
    }
  };

  return (
    <div className="relative w-screen h-screen font-body bg-[#0a1929]">
      <Canvas
        shadows={{ type: PCFSoftShadowMap }}
        camera={{
          // Start over the middle of the map (the rectangle's corner is the origin)
          position: [
            cam.target[0] + cam.isoDistance * CAMERA_OFFSET[0],
            cam.target[1] + cam.isoDistance * CAMERA_OFFSET[1],
            cam.target[2] + cam.isoDistance * CAMERA_OFFSET[2],
          ],
          fov: CAMERA_FOV,
          near: 0.1,
          far: 1000,
        }}
        style={{ background: '#0a1929' }}
      >
        <Scene
          G={G}
          currentPlayer={currentPlayer}
          cam={cam}
          movesRemaining={movesRemaining}
          attackMode={attackMode}
          spyglassMode={spyglassMode}
          attackTargetHexes={attackTargetHexes}
          spyglassTargetHexes={spyglassTargetHexes}
          sinkingShips={sinkingShips}
          npcs={G.npcs}
          hoveredShipId={hoveredShipId}
          hoveredPort={hoveredPort}
          scoutedPlayerIds={currentShipState?.scoutedShips ?? []}
          focusPosition={cameraFocusPosition}
          onMoveShip={(q, r) => props.moves.moveShip(q, r)}
          onHexClick={spyglassMode ? handleHexClickForSpyglass : handleHexClickForAttack}
          onSinkingComplete={handleSinkingComplete}
          onShipHover={setHoveredShipId}
          onShipClick={(id) => {
            if (id === currentPlayer) {
              setShowDetailsPanel(true);
            }
          }}
          onPortHover={setHoveredPort}
        />
      </Canvas>

      {/* Combat Panel */}
      {inCombat && G.combat && (
        <CombatPanel
          combat={G.combat}
          ships={G.ships}
          npcs={G.npcs}
          onRollSeamanship={() => props.moves.rollSeamanship()}
          onChooseAction={(action) => props.moves.chooseCombatAction(action)}
          onRollFleeAttempt={() => props.moves.rollFleeAttempt()}
          onRollCannons={() => props.moves.rollCannons()}
          onApplyResolution={() => props.moves.applyResolution()}
        />
      )}

      {/* Top bar - only show in main phase */}
      {!inCombat && currentShipState && (
        <HudTurnBar
          mapLabel={preset.label}
          movesRemaining={movesRemaining}
          maxMoves={maxMoves}
          gold={currentShipState.gold}
          glory={currentShipState.score}
          onEndTurn={() => props.events.endTurn!()}
        />
      )}

      {/* Bottom-left: unified HUD panel */}
      {currentShipState && (
        <div className="absolute bottom-4 left-4 flex rounded-xl overflow-hidden border border-amber-800/30 bg-gradient-to-br from-stone-900/92 via-amber-950/88 to-stone-950/92 shadow-2xl shadow-black/50 backdrop-blur-md">
          {/* Captain half */}
          <div className="w-52 p-3.5 border-r border-amber-800/20">
            <HudCaptainCard
              captain={currentShipState.captain}
              playerIndex={currentPlayer}
              playerColor={PLAYER_COLORS[currentPlayer] ?? "#888"}
            />
          </div>

          {/* Ship half */}
          <div className="w-60 p-3.5">
            <HudShipCard ship={currentShipState} />
          </div>
        </div>
      )}

      {/* Action buttons - only in main phase */}
      {!inCombat && currentShipState && (hasAttackTargets || hasSpyglassTargets) && (
        <div className="absolute bottom-4 right-4 flex gap-2">
          {/* Spyglass button */}
          {hasSpyglassTargets && (
            <button
              onClick={() => {
                setSpyglassMode(!spyglassMode);
                if (!spyglassMode) setAttackMode(false);
              }}
              className={`font-heading py-3 px-6 rounded-lg text-sm font-bold cursor-pointer transition-colors uppercase tracking-wider ${
                spyglassMode
                  ? "bg-cyan-600 hover:bg-cyan-500 text-white border-2 border-cyan-400"
                  : "bg-cyan-800/70 hover:bg-cyan-700/70 text-cyan-100 border border-cyan-700/50"
              }`}
            >
              {spyglassMode ? "Cancel Scout" : "Spyglass"}
            </button>
          )}
          {/* Attack button */}
          {hasAttackTargets && (
            <button
              onClick={() => {
                setAttackMode(!attackMode);
                if (!attackMode) setSpyglassMode(false);
              }}
              className={`font-heading py-3 px-6 rounded-lg text-sm font-bold cursor-pointer transition-colors uppercase tracking-wider ${
                attackMode
                  ? "bg-red-600 hover:bg-red-500 text-white border-2 border-red-400"
                  : "bg-red-800/70 hover:bg-red-700/70 text-red-100 border border-red-700/50"
              }`}
            >
              {attackMode ? "Cancel Attack" : "Attack!"}
            </button>
          )}
        </div>
      )}

      {/* Attack mode indicator */}
      {attackMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-900/90 text-red-100 px-4 py-2 rounded-lg text-sm border border-red-700">
          Select an enemy ship to attack (red hexes)
        </div>
      )}

      {/* Spyglass mode indicator */}
      {spyglassMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-cyan-900/90 text-cyan-100 px-4 py-2 rounded-lg text-sm border border-cyan-700">
          Select a ship to scout with your spyglass (red hexes)
        </div>
      )}

      {/* Right: Port panel - only in main phase when docked at a port */}
      {!inCombat && currentShipState && (() => {
        const accessiblePort = findAccessiblePort(currentShipState.position, G.cells, G.wrap);
        if (!accessiblePort?.market) return null;
        return (
          <PortPanel
            ship={currentShipState}
            market={accessiblePort.market}
            portNation={accessiblePort.nation}
            portName={accessiblePort.portName}
            hasShipyard={accessiblePort.hasShipyard}
            onTrade={(good, amount, action) =>
              props.moves.trade(good, amount, action)
            }
            onBuyUpgrade={(upgradeId) =>
              props.moves.buyUpgrade(upgradeId)
            }
            onRepair={(category, points) =>
              props.moves.repair(category, points)
            }
            onBuyShip={(newClass) =>
              props.moves.buyShip(newClass)
            }
            onListenForRumors={() =>
              props.moves.listenForRumors()
            }
            onAbandonMission={() =>
              props.moves.abandonMission()
            }
          />
        );
      })()}

      {/* Ship Details Panel */}
      {showDetailsPanel && currentShipState && (
        <ShipDetailsPanel
          ship={currentShipState}
          onClose={() => setShowDetailsPanel(false)}
          onStashGold={(amount) => props.moves.stashGold(amount)}
        />
      )}

      {/* Mission Complete Toast */}
      {completedMission && (
        <MissionCompleteToast
          title={completedMission.title}
          reward={completedMission.reward}
          onComplete={() => setCompletedMission(null)}
        />
      )}

      {/* Turn Change Animation */}
      {showTurnChange && currentShipState && (
        <TurnChangeAnimation
          playerIndex={currentPlayer}
          playerColor={PLAYER_COLORS[currentPlayer] ?? "#888888"}
          captain={currentShipState.captain}
          onComplete={() => setShowTurnChange(false)}
        />
      )}

      {/* Docking Animation */}
      {dockingPort && dockingPort.portName && (
        <DockingAnimation
          portName={dockingPort.portName}
          nation={dockingPort.nation}
          market={dockingPort.market}
          onComplete={() => setDockingPort(null)}
        />
      )}

      {/* Game Over Screen */}
      {ctx.gameover && (
        <GameOverScreen
          winner={ctx.gameover.winner}
          captainName={ctx.gameover.captainName}
          score={ctx.gameover.score}
          onPlayAgain={() => window.location.reload()}
        />
      )}
    </div>
  );
}
