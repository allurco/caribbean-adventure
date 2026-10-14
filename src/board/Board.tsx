import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import { PerspectiveCamera, Vector3 } from "three";
import type { MapControls as MapControlsType } from "three-stdlib";
import type { BoardProps } from "boardgame.io/react";
import type { CaribbeanState } from "../game/Game";
import { getMaxMoves } from "../game/Game";
import type { Hex } from "../game/hex";
import type { ShipState, ShipClass, NPCShip, MapCell } from "../game/types";
import { hexToWorld, hexEquals, wrapWorldWidth } from "../game/hex";
import { findAccessiblePort, dockingHexes } from "../game/moves";
import { turnReach, routeTo, reachCost } from "../game/reach";
import { getValidAttackTargets, getValidNPCAttackTargets } from "../game/combat";
import { getValidScoutTargets } from "../game/scouting";
import { getMapPreset, computeCameraConfig } from "../game/mapConfig";
import { HexGrid } from "./HexGrid";
import { useHexGrid } from "./useHexGrid";
import { useHoverFollowsCamera } from "./useHoverFollowsCamera";
import { Ocean } from "./visuals/Ocean";
import { LandTerrain } from "./visuals/LandTerrain";
import { useLandTerrain } from "./visuals/useLandTerrain";
import { TerrainDecorations } from "./visuals/TerrainDecorations";
import { useDecorationLayout } from "./visuals/useDecorationLayout";
import { SunLight } from "./visuals/SunLight";
import { FillLight } from "./visuals/FillLight";
import { useSkyEnvironment } from "./visuals/useSkyEnvironment";
import { useWaveCascades } from "./visuals/useWaveCascades";
import { useWaveClock } from "./visuals/useWaveClock";
import { SeaBuoys } from "./visuals/SeaBuoys";
import { createSeaSurface, fieldSeabed } from "./visuals/seaSurface";
import { SeaSurfaceContext } from "./visuals/seaSurfaceContext";
import { useTerrainFieldTexture } from "./visuals/useTerrainFieldTexture";
import { WAVE_CASCADES, WHITECAP_CASCADES } from "./visuals/oceanWaves";
import { DISPLACEMENT_CASCADES } from "./visuals/waveDisplacement";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { SHADOW_MAP_TYPE, sunShadowFor } from "./visuals/atmosphere";
import { SCENE_LIGHTING } from "./visuals/sceneLighting";
import { PostEffects } from "./visuals/PostEffects";
import {
  CAMERA_BOUNDS_PADDING,
  CAMERA_FOV,
  CAMERA_DIRECTION,
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_NEAR,
  cameraBoundsFromHexes,
  cameraNearFor,
  clampToCameraBounds,
} from "./cameraBounds";
import { focusHeight } from "./groundFollow";
import { sharedTerrainField } from "./visuals/sharedTerrainField";
import { worldSeedOf } from "./visuals/subSeed";
import {
  clampFocusToBand,
  groundFootprint,
  mapBand,
  seamAwareStart,
  wrapCopyRange,
} from "./wrapView";
import { openingView, turnChangeView, type CameraView } from "./shipView";
import { flightStep, flightStyle, type FlightStyle } from "./cameraFlight";
import { seamStrip } from "./visuals/seamStrip";
import { PointerCopy, WorldCopies } from "./WorldCopies";
import { Ship, SinkingShip } from "./Ship";
import { openWaterFrom, seaRoute } from "./shipRoute";
import { spawnHeading } from "./shipSpawnHeading";
import { ReachOverlay } from "./ReachOverlay";
import { plannedCourse, routeDots } from "./routePreview";
import { reachClick, reachConfirm, selectionKey } from "./routeSelection";
import { clipToWater, reachEdges, ribbonPositions, waterHexTriangles } from "./reachOutline";
import { useRouteSailing } from "./useRouteSailing";
import { RouteHint } from "./RouteHint";
import { useTurnHandoff } from "./useTurnHandoff";
import { controlsLocked, holdsNpcs } from "./turnHandoff";
import { TurnEndedBanner } from "./TurnEndedBanner";
import type { Point } from "./shipMotion";
import { trackShipHeadings } from "./shipHeading";
import { ShipTooltip } from "./ShipTooltip";
import { PortTooltip } from "./PortTooltip";
import { ShipDetailsPanel } from "./ShipDetailsPanel";
import { PortPanel } from "./PortPanel";
import { DraftScreen } from "./DraftScreen";
import { HudParchmentPanel } from "./HudParchmentPanel";
import { HudTurnBar } from "./HudTurnBar";
import { CombatPanel } from "./CombatPanel";
import { GameOverScreen } from "./GameOverScreen";
import { DockingAnimation } from "./DockingAnimation";
import { TurnChangeAnimation } from "./TurnChangeAnimation";
import { MissionCompleteToast } from "./MissionCompleteToast";
import { CameraAudioListener } from "./CameraAudioListener";
import { AmbienceBedDriver } from "./AmbienceBedDriver";
import { HudSoundControl } from "./HudSoundControl";
import { RenderStatsProbe } from "./RenderStatsProbe";
import { RenderStatsOverlay } from "./RenderStatsOverlay";
import { DevSeedControl } from "./DevSeedControl";
import { PLAYER_COLOURS } from "./shipOwnerColour";
import { npcShipLook, playerShipLook } from "./shipLook";
import type { ShipFlag } from "./shipFlags";
import { GallerySnapshot } from "../lab/GallerySnapshot";
import { STARTER_SHIP_CLASSES } from "../game/types";
import { createRenderStatsFeed } from "./renderStats";
import { useAudioUnlock } from "../audio/useAudioUnlock";
import { useGameSounds } from "../audio/useGameSounds";
import type { Mission } from "../game/types";

interface SinkingShipData {
  id: string;
  position: [number, number, number];
  color: string;
  shipClass?: ShipClass;
  /** The heading it last sailed on, which it goes down facing. */
  heading: number;
  /** The flag it flew, which goes down limp with it (#204). */
  flag: ShipFlag | null;
}

/**
 * World units past the edge of the view that copies of a wrapping world still
 * cover: things poke out of their strip by up to about a hex (a ship sailing
 * across the seam starts a column outside it), plus a hex for tall islands
 * and labels seen at an angle.
 */
const WRAP_COPY_MARGIN = 3;

/** The reach's lines and tint over the sea (#213): widths in world units, heights above sea level. */
const REACH_OUTLINE_WIDTH = 0.04;
const REACH_RING_WIDTH = 0.03;
const REACH_TINT_Y = 0.012;
const REACH_LINE_Y = 0.02;

/** A hex whose route shows after a first click, and the `selectionKey` of the ship it was made for. */
interface RouteSelection {
  hex: Hex;
  from: string;
}

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
  focusView,
  sailing,
  plannedRoute,
  locked,
  shipUnderway,
  selection,
  onSelect,
  onShipUnderway,
  onMoveShip,
  onSailRoute,
  onHexClick,
  onSinkingComplete,
  onShipHover,
  onShipClick,
  onPortHover,
  onCameraCut,
  seaBuoys,
}: {
  G: CaribbeanState;
  currentPlayer: string;
  /** The first target. */
  cam: { target: [number, number, number] };
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
  /** Where to fly the camera: a new view starts a flight. */
  focusView: CameraView | null;
  /** A planned route is being sailed: no reach, no moves (#213). */
  sailing: boolean;
  /** The route being sailed, if any. */
  plannedRoute: Hex[] | null;
  /** The turn is being handed over (#216): the next player's controls wait. */
  locked: boolean;
  /** The current player's ship is still on its way: the reach waits until it settles. */
  shipUnderway: boolean;
  /** The hex whose route shows after a first click, with the `selectionKey` it was made for. */
  selection: RouteSelection | null;
  onSelect: (selection: RouteSelection | null) => void;
  /** A player's ship got under way or came to rest. */
  onShipUnderway: (id: string, underway: boolean) => void;
  onMoveShip: (q: number, r: number) => void;
  /** Sail a planned route, one move per hex (#213). */
  onSailRoute: (route: Hex[]) => void;
  onHexClick: (hex: Hex) => void;
  onSinkingComplete: (id: string) => void;
  onShipHover: (id: string | null) => void;
  onShipClick: (id: string) => void;
  onPortHover: (cell: MapCell | null) => void;
  /** The camera cut straight to its goal instead of flying (reduced motion, #229). */
  onCameraCut: () => void;
  /** Dev: buoys on the CPU sea surface (#141). */
  seaBuoys: boolean;
}) {
  const currentShipState = G.ships[currentPlayer];
  const controlsRef = useRef<MapControlsType>(null);
  const { camera } = useThree();
  const targetPosition = useRef(new Vector3());
  const targetDistance = useRef(0);
  const isAnimating = useRef(false);
  // How the current flight goes, chosen on its first frame (cameraFlight.ts, #229)
  const flight = useRef<FlightStyle | null>(null);
  // All light comes from one `Lighting` at the scene's time of day (#169).
  const lighting = SCENE_LIGHTING;
  const sunShadow = useMemo(() => sunShadowFor(lighting.sun), [lighting.sun]);
  // Physical sky as image-based lighting for the whole scene (replaces the old
  // hemisphere and fill lights) and as the sea's reflection.
  const skyEnvironment = useSkyEnvironment(lighting);
  // The sea's wave slopes, rebuilt on the GPU each frame (frozen under
  // reduced motion). The water shades its surface with them and the seabed
  // focuses its sunlight through them (#38 step 6), so they live here; the
  // large cascades' displacement moves the water's mesh and the grid lines
  // on it (#38 step 8).
  const reducedMotion = usePrefersReducedMotion();
  // One wave clock for the cascades and every CPU reader of the sea (#141).
  const waveClock = useWaveClock(reducedMotion);
  const waves = useWaveCascades(WAVE_CASCADES, WHITECAP_CASCADES, DISPLACEMENT_CASCADES, waveClock);
  const waveSlopes = waves.slopes;
  // The baked terrain field, read by the water (depth, coast, reefs) and by
  // the land's shoreline foam (#38 step 7).
  // The world seed every seeded visual draws from (ADR 0007).
  const worldSeed = worldSeedOf(G);
  const terrainField = useTerrainFieldTexture(G.cells, G.wrap, worldSeed);

  const cameraBounds = useMemo(
    () => cameraBoundsFromHexes(G.cells.map((c) => c.hex), CAMERA_BOUNDS_PADDING),
    [G.cells]
  );

  // East–west wrap (#36): the world is drawn in copies one wrap width apart
  // that follow the camera, which pans east or west forever; north and south
  // the focus itself stays over the rows of hexes (Civ style), at every zoom,
  // so a map edge can always be panned to the screen centre with open sea
  // past it. The zoom-out cap is the same on every map size. The camera looks
  // due north (CAMERA_DIRECTION), so a horizontal drag pans along the wrap axis
  // only and the map's north and south edges are horizontal on screen.
  const strip = useMemo(() => seamStrip(G.wrap), [G.wrap]);
  const period = wrapWorldWidth(G.wrap);
  // A ship that moves several hexes at once (an NPC's turn) sails round the land through them (#212).
  // A planned route (#213) is given to the ship whole as its first move lands
  const shipRoute = useCallback(
    (from: Point, to: Point) => plannedCourse(plannedRoute, to) ?? seaRoute(from, to, G.cells, G.wrap),
    [G.cells, G.wrap, plannedRoute]
  );
  // The heading each ship lies at before it first sails: toward open sea, seeded per ship (#212).
  const shipSpawnHeading = useMemo(() => {
    const water = new Set(G.cells.filter((c) => c.terrain === "water").map((c) => `${c.hex.q},${c.hex.r}`));
    return (id: string, position: Hex) => spawnHeading(worldSeed, id, position, (h) => water.has(`${h.q},${h.r}`), G.wrap);
  }, [G.cells, G.wrap, worldSeed]);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const footprint = useMemo(() => groundFootprint(CAMERA_DIRECTION,CAMERA_FOV, aspect), [aspect]);
  const band = useMemo(() => mapBand(getMapPreset(G.mapSize).rows), [G.mapSize]);
  const copies = useMemo(
    () => (strip && footprint ? wrapCopyRange(footprint, CAMERA_MAX_DISTANCE, period, WRAP_COPY_MARGIN) : { from: 0, to: 0 }),
    [strip, footprint, period]
  );


  /** The focus nearest (x, z) the camera may have: x as is on a wrapping map. */
  const clampFocus = useCallback(
    (x: number, z: number): { x: number; z: number } => {
      if (strip) return { x, z: clampFocusToBand(z, band) };
      const clamped = clampToCameraBounds(cameraBounds, x, z);
      return { x: clamped.x, z: clamped.z };
    },
    [strip, band, cameraBounds]
  );

  // The ground the focus follows at town zoom (#90): the one terrain field.
  const ground = useMemo(() => sharedTerrainField(G.cells, G.wrap, worldSeed).sampleHeight, [G.cells, G.wrap, worldSeed]);
  // Where a ship may come about without swinging over the shore (#212).
  const shipOpenWater = useMemo(() => openWaterFrom(ground), [ground]);

  // The one CPU sea surface (#141), read at the wave clock by everything that
  // rides the swell: the ships (#142) and the dev buoys.
  const seaSurface = useMemo(
    () => createSeaSurface({ seabedHeightAt: fieldSeabed(sharedTerrainField(G.cells, G.wrap, worldSeed)), enabled: waves.enabled }),
    [G.cells, G.wrap, worldSeed, waves.enabled]
  );
  const sea = useMemo(() => ({ clock: waveClock, surface: seaSurface }), [waveClock, seaSurface]);

  // Keep the view over the map: after every MapControls update (pan, zoom,
  // damping, focus-lerp) pull the target back inside the bounds, and at town
  // zoom onto the ground (groundFollow.ts), and move the camera by the same
  // delta, so the view angle and zoom are unchanged. The near plane closes in
  // with the zoom (cameraNearFor).
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const correction = new Vector3();
    const clamp = () => {
      const target = controls.target;
      const distance = camera.position.distanceTo(target);
      const { x, z } = clampFocus(target.x, target.z);
      const y = focusHeight({ x, z }, distance, ground);
      correction.set(x - target.x, y - target.y, z - target.z);
      if (correction.x !== 0 || correction.y !== 0 || correction.z !== 0) {
        target.add(correction);
        camera.position.add(correction);
      }
    };
    // Apply any pending controls change (window resized) before clamping.
    controls.update();
    clamp();
    controls.addEventListener("change", clamp);
    return () => controls.removeEventListener("change", clamp);
  }, [clampFocus, camera, ground]);

  // The near plane closes in with the zoom (cameraNearFor, #90). Priority -1
  // runs it before Ocean copies the projection inverse (priority 0) and the
  // seabed prepass (> 0), so both see this frame's near plane; a negative
  // priority does not take over rendering.
  useFrame(({ camera: view }) => {
    const target = controlsRef.current?.target;
    if (!target || !(view instanceof PerspectiveCamera)) return;
    const near = cameraNearFor(view.position.distanceTo(target));
    if (view.near === near) return;
    view.near = near;
    view.updateProjectionMatrix();
  }, -1);

  // A port's tooltip (and any hover) follows the scene as the camera moves
  // under a still pointer (re-tested on the next frame, after the clamp above)
  useHoverFollowsCamera(controlsRef);

  // Animate camera to focus view when it changes
  useEffect(() => {
    if (focusView && controlsRef.current) {
      targetPosition.current.set(focusView.target[0], 0, focusView.target[2]);
      // Within the zoom limits, or the controls would hold it off forever
      targetDistance.current = Math.min(CAMERA_MAX_DISTANCE, Math.max(CAMERA_MIN_DISTANCE, focusView.distance));
      isAnimating.current = true;
      flight.current = null;
    }
  }, [focusView]);

  // Smooth camera animation: focus and zoom move together (cameraFlight.ts)
  useFrame(() => {
    if (isAnimating.current && controlsRef.current) {
      const controls = controlsRef.current;
      const target = controls.target;

      // Aim for the clamped focus so the lerp can actually arrive, going the
      // short way round on a wrapping map
      const goal = targetPosition.current;
      const { x, z } = clampFocus(seamAwareStart(goal.x, target.x, period), goal.z);
      // Across only: the focus height is the ground follow's (#90), set on update
      goal.set(x, target.y, z);

      // The camera keeps its direction from the focus; only the distance changes
      const direction = new Vector3().subVectors(camera.position, target);
      const view = { x: target.x, z: target.z, distance: direction.length() };
      const flightGoal = { x, z, distance: targetDistance.current };
      if (!flight.current) {
        // Under reduced motion, no sweep across the sea: a quick glide or a cut
        flight.current = flightStyle(view, flightGoal, reducedMotion);
        if (flight.current.kind === "cut") onCameraCut();
      }
      const step = flightStep(view, flightGoal, flight.current.kind === "cut" ? 1 : flight.current.alpha);
      // Keep the ground follow's height; the clamp on update corrects it
      target.set(step.x, target.y, step.z);
      camera.position.copy(target).addScaledVector(direction.normalize(), step.distance);
      if (step.arrived) isAnimating.current = false;

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
  // The turn's reach (#213): every hex the ship can sail to with the moves
  // left, routed round land and ships, a port's docking hex ending a route.
  const stops = useMemo(() => dockingHexes(G.cells), [G.cells]);
  const canMove = movesRemaining > 0 && !locked && !sailing && !shipUnderway && !attackMode && !spyglassMode;
  const reach = useMemo(() => {
    if (!currentShipState || !canMove) return null;
    return turnReach(currentShipState.position, movesRemaining, G.cells, G.wrap, {
      occupied: otherShipPositions,
      shallowDraft: currentShipState.stats?.shallowDraft ?? true,
      stops,
    });
  }, [currentShipState, canMove, movesRemaining, G.cells, G.wrap, otherShipPositions, stops]);
  const targets = useMemo(() => reach?.hexes.map((s) => s.hex) ?? [], [reach]);

  // The selection lapses once the ship moves or the turn passes (its key no longer matches).
  const shipKey = currentShipState ? selectionKey(currentPlayer, currentShipState.position) : "";
  const selected = reach && selection && selection.from === shipKey && reachCost(reach, selection.hex) !== undefined ? selection.hex : null;

  // Built once per map (and turn) and drawn by every copy of the world: the
  // copies share these geometries, materials and hover state.
  const landTerrain = useLandTerrain(G.cells, G.wrap, worldSeed, { sun: lighting.sun.direction, waveSlopes, terrainField });
  const decorations = useDecorationLayout(G.cells, G.wrap, worldSeed);
  // The displaced sea the grid lines float on (#38 step 8).
  const waveSurface = useMemo(
    () => ({ displacements: waves.displacements, terrainField }),
    [waves.displacements, terrainField]
  );
  const grid = useHexGrid({
    surface: waveSurface,
    cells: G.cells,
    wrap: G.wrap,
    worldSeed,
    validTargets: targets,
    attackTargets: attackMode ? attackTargetHexes : spyglassMode ? spyglassTargetHexes : [],
    onHexClick: (h) => {
      if (attackMode || spyglassMode) {
        onHexClick(h);
        return;
      }
      if (!reach) return;
      const click = reachClick(reach, selected, h);
      if (click.kind === "move") onMoveShip(click.hex.q, click.hex.r);
      else if (click.kind === "sail") onSailRoute(click.route);
      onSelect(click.kind === "select" ? { hex: click.hex, from: shipKey } : null);
    },
    onMiss: () => onSelect(null),
    onPortHover,
    interactive: !locked && (attackMode || spyglassMode || canMove),
    // A new turn starts with no hover, so the next player sees no stale preview
    resetKey: currentPlayer,
  });

  // The route to the selected hex, else the hovered one, as dots on the water
  const hovered = reach && grid.hoveredHex && reachCost(reach, grid.hoveredHex) !== undefined ? grid.hoveredHex : null;
  const previewTarget = selected ?? hovered;
  // The reach as an outline, cost rings and a light tint one move out, all on the water (reachOutline.ts)
  const reachShapes = useMemo(() => {
    if (!reach) return null;
    const { boundary, rings } = reachEdges(reach, G.cells);
    const oneMove = reach.hexes.filter((s) => s.cost === 1).map((s): Point => {
      const [x, , z] = hexToWorld(s.hex);
      return [x, z];
    });
    return {
      tint: waterHexTriangles(oneMove, ground, REACH_TINT_Y),
      outline: ribbonPositions(clipToWater(boundary, ground), REACH_OUTLINE_WIDTH, REACH_LINE_Y),
      rings: ribbonPositions(clipToWater(rings, ground), REACH_RING_WIDTH, REACH_LINE_Y),
    };
  }, [reach, G.cells, ground]);
  const targetShape = useMemo(() => {
    if (!previewTarget) return null;
    const [x, , z] = hexToWorld(previewTarget);
    return waterHexTriangles([[x, z]], ground, REACH_TINT_Y + 0.002, 0.94);
  }, [previewTarget, ground]);
  const routeDotPoints = useMemo(
    () => (reach && previewTarget ? routeDots(reach.start, routeTo(reach, previewTarget), period) : []),
    [reach, previewTarget, period]
  );

  // Enter sails the previewed route; Escape drops the selection
  useEffect(() => {
    if (!reach) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") onSelect(null);
      if (e.key === "Enter") {
        const route = reachConfirm(reach, selected, hovered);
        if (route.length === 0) return;
        e.preventDefault();
        onSelect(null);
        onSailRoute(route);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reach, selected, hovered, onSailRoute, onSelect]);

  return (
    <SeaSurfaceContext.Provider value={sea}>
    <>
      {/* The ears of the game: the audio listener rides on the camera (#73) */}
      <CameraAudioListener />
      {/* Wind and waves, crossfading with the zoom */}
      <AmbienceBedDriver />

      {/* Horizon haze: background matches the fog so the far edge dissolves */}
      <color attach="background" args={[lighting.haze.color]} />
      <fog attach="fog" args={[lighting.haze.color, lighting.haze.near, lighting.haze.far]} />

      {/* Low, warm golden-hour sun ahead and right of the camera; shadow box follows the camera target and fits the view */}
      <SunLight sun={lighting.sun} shadow={sunShadow} />
      {/* Shadowless fill from behind the camera: stands in for the sand and whitewash bounce the sky map lacks (#63) */}
      <FillLight fill={lighting.fill} />
      {/* Warm ambient so faces turned from the low sun stay readable (#169); main layer only, off the seabed prepass */}
      <hemisphereLight
        color={lighting.ambient.skyColor}
        groundColor={lighting.ambient.groundColor}
        intensity={lighting.ambient.intensity}
      />

      {/* Ocean, coloured by depth from the same terrain height field: a grid
          of level-of-detail rings under the camera focus (oceanGrid.ts),
          displaced by the large wave cascades and sized so its edge is never
          on screen. One grid for every copy of the world. Waits for the sky
          it reflects. */}
      {skyEnvironment && (
        <Ocean
          terrainField={terrainField}
          sun={lighting.sun.direction}
          sunColor={lighting.sun.color}
          sunIntensity={lighting.sun.intensity}
          light={lighting.ocean}
          sky={skyEnvironment.texture}
          skyHeight={skyEnvironment.textureHeight}
          skyIntensity={skyEnvironment.intensity}
          waveSlopes={waveSlopes}
          waveWhitecaps={waves.whitecaps}
          waveDisplacements={waves.displacements}
        />
      )}

      {/* Dev: buoys on the CPU sea surface, to check it rides the drawn swell (#141) */}
      {seaBuoys && <SeaBuoys />}

      {/* Everything on the map, once per copy of the wrapping world */}
      <WorldCopies period={period} stripMinX={strip?.minX ?? 0} from={copies.from} to={copies.to}>
      {(copy) => (
      <>
      {/* Islands: one continuous mesh from the terrain height field */}
      <LandTerrain terrain={landTerrain} />

      {/* Terrain decorations: trees, rocks, shore boulders, piers */}
      <TerrainDecorations layout={decorations} waveSlopes={waveSlopes} />

      <HexGrid grid={grid} copy={copy} />

      {/* The turn's reach and the previewed route (#213) */}
      <ReachOverlay reach={reachShapes} target={targetShape} dots={routeDotPoints} />

      {Object.entries(G.ships).map(([id, ship]) => (
        <Ship
          key={id}
          position={hexToWorld(ship.position)}
          color={playerShipLook(G, id).colour}
          flag={playerShipLook(G, id).flag}
          shipClass={ship.shipClass}
          wrapWidth={period}
          seaRoute={shipRoute}
          openWater={shipOpenWater}
          initialHeading={shipSpawnHeading(id, ship.position)}
          foamId={copy === 0 ? id : undefined}
          foamPlayer
          onUnderway={copy === 0 ? (underway) => onShipUnderway(id, underway) : undefined}
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
          color={npcShipLook(npc).colour}
          flag={npcShipLook(npc).flag}
          shipClass={npc.shipClass}
          wrapWidth={period}
          seaRoute={shipRoute}
          openWater={shipOpenWater}
          initialHeading={shipSpawnHeading(npc.id, npc.position)}
          foamId={copy === 0 ? npc.id : undefined}
          onUnderway={copy === 0 ? (underway) => onShipUnderway(npc.id, underway) : undefined}
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
          flag={ship.flag}
          heading={ship.heading}
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
        // Both limits are the same on every map size (Civ style); the focus
        // clamp above keeps the view on the map, with open sea past the rows
        // on a small map.
        minDistance={CAMERA_MIN_DISTANCE}
        maxDistance={CAMERA_MAX_DISTANCE}
      />

      {/* Post-processing: bloom, vignette, ACES at the lighting's exposure, warm grade */}
      <PostEffects lighting={lighting} />
    </>
    </SeaSurfaceContext.Provider>
  );
}

export interface CaribbeanBoardProps extends BoardProps<CaribbeanState> {
  /** Where the camera looks on the first frame instead of the map's middle (dev, #74). */
  cameraTarget?: [number, number, number];
  /** How far from its target the camera starts instead of the map's iso distance (dev, #74). */
  cameraDistance?: number;
  /** Float buoys on the CPU sea surface round the camera focus (dev, #141). */
  seaBuoys?: boolean;
  /** Show the fps, draw calls and triangles readout (dev, #162); ignored in production builds. */
  renderStats?: boolean;
  /** A seed-gallery shot (dev, #161): the draft picks itself and the frame is posted to the gallery; ignored in production builds. */
  gallerySnapshot?: boolean;
}

export function CaribbeanBoard(props: CaribbeanBoardProps) {
  const { G, ctx, cameraTarget, cameraDistance, seaBuoys, renderStats, gallerySnapshot } = props;
  const snapshot = import.meta.env.DEV && gallerySnapshot === true;
  // Dev seed gallery (#161): each seat takes its first captain and starter ship, so the shot reaches the main phase.
  const { pickCaptain } = props.moves;
  useEffect(() => {
    if (snapshot && ctx.phase === "draft") pickCaptain(0, STARTER_SHIP_CLASSES[0]);
  }, [snapshot, ctx.phase, ctx.currentPlayer, pickCaptain]);
  // Dev `stats=1` (#162): the probe in the Canvas reports to the overlay through this feed.
  const renderStatsFeed = useMemo(() => (renderStats ? createRenderStatsFeed() : null), [renderStats]);
  const [attackMode, setAttackMode] = useState(false);
  const [spyglassMode, setSpyglassMode] = useState(false);
  const [sinkingShips, setSinkingShips] = useState<SinkingShipData[]>([]);
  const [hoveredShipId, setHoveredShipId] = useState<string | null>(null);
  const [hoveredPort, setHoveredPort] = useState<MapCell | null>(null);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [dockingPort, setDockingPort] = useState<MapCell | null>(null);
  const [showTurnChange, setShowTurnChange] = useState(false);
  // Camera cuts so far (reduced motion, #229): each one lifts a brief veil over the scene
  const [cameraCuts, setCameraCuts] = useState(0);
  const cameraCut = useCallback(() => setCameraCuts((n) => n + 1), []);
  const [completedMission, setCompletedMission] = useState<Mission | null>(null);
  const [cameraFocusView, setCameraFocusView] = useState<CameraView | null>(null);
  // The first view, taken once when the main phase starts: MapControls
  // re-aims at its `target` prop whenever that changes.
  const [firstView, setFirstView] = useState<CameraView | null>(null);

  const currentPlayer = ctx.currentPlayer;
  const currentShipState = G.ships[currentPlayer];

  // Sound (#73): audio unlocks on the first click (the draft pick), then
  // every change of G plays the sounds its moves map to.
  const prefersReducedMotion = usePrefersReducedMotion();
  useAudioUnlock();
  useGameSounds(G);

  // A planned route (#213) is sailed one moveShip per hex.
  const { moveShip } = props.moves;
  const moveOneHex = useCallback((q: number, r: number) => moveShip(q, r), [moveShip]);
  const { sailing, plan: plannedRoute, sail } = useRouteSailing(G, ctx, moveOneHex);
  // Which players' ships are still on their way (the reach waits for the current one to settle)
  const [underway, setUnderway] = useState<Record<string, boolean>>({});
  const onShipUnderway = useCallback(
    (id: string, now: boolean) => setUnderway((u) => (Boolean(u[id]) === now ? u : { ...u, [id]: now })),
    []
  );
  const [routeSelection, setRouteSelection] = useState<RouteSelection | null>(null);

  // Track previous player to detect turn changes

  // Track previous mission to detect completion (includes player ID to avoid false triggers on turn change)
  const prevMissionRef = useRef<{ mission: Mission | undefined; playerId: string } | null>(null);

  // Track previous port to detect new docking
  const prevPortRef = useRef<string | null>(null);

  // Detect ships that were removed (sunk)
  // Use a ref to track previous ship IDs without causing re-renders
  const prevShipIdsRef = useRef<Set<string>>(new Set(Object.keys(G.ships)));
  const prevShipSnapshotsRef = useRef<Record<string, ShipState>>(G.ships);
  // Each ship's last heading, so a sunk ship goes down facing the way it sailed.
  const shipHeadingsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const currentIds = Object.keys(G.ships);
    const currentIdSet = new Set(currentIds);
    const prevIds = prevShipIdsRef.current;
    const prevSnapshots = prevShipSnapshotsRef.current;
    const headings = trackShipHeadings(shipHeadingsRef.current, prevSnapshots, G.ships, wrapWorldWidth(G.wrap));

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
        color: PLAYER_COLOURS[id] ?? "#888888",
        shipClass: prevSnapshots[id].shipClass,
        heading: headings[id] ?? 0,
        // The flag it flew, from its last state: it has left G.ships (#204).
        flag: playerShipLook(G, id, prevSnapshots[id]).flag,
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
    for (const id of removedIds) delete headings[id];
    shipHeadingsRef.current = headings;
  }, [G]);

  // Detect when current player docks at a new port
  useEffect(() => {
    if (!currentShipState || ctx.phase === "draft") return;

    const accessiblePort = findAccessiblePort(currentShipState.position, G.cells, G.wrap);
    // Keyed by player: a new turn that starts in port is not an arrival (#216)
    const currentPortId = `${currentPlayer}:${accessiblePort?.portName ?? ""}`;
    const prevPortId = prevPortRef.current;
    if (prevPortId === null || !prevPortId.startsWith(`${currentPlayer}:`)) {
      prevPortRef.current = currentPortId;
      return;
    }

    // If we just arrived at a new port (different from previous)
    if (accessiblePort?.portName && currentPortId !== prevPortId) {
      // Defer to avoid synchronous setState in effect
      const timer = setTimeout(() => setDockingPort(accessiblePort), 0);
      prevPortRef.current = currentPortId;
      return () => clearTimeout(timer);
    }

    prevPortRef.current = currentPortId;
  }, [currentShipState?.position, G.cells, G.wrap, ctx.phase, currentShipState, currentPlayer]);

  // The hand-off between turns (#216): the outgoing ship arrives, a "turn
  // ends" beat, the NPCs sail, and only then the next turn is announced
  const shipsRef = useRef(G.ships);
  useEffect(() => {
    shipsRef.current = G.ships;
  }, [G.ships]);
  const announceTurn = useCallback(
    (player: string) => {
      setShowTurnChange(true);
      // Hotseat: fly to the new player's ship (networked clients stay put)
      const view = turnChangeView({ ships: shipsRef.current, currentPlayer: player, playerID: props.playerID });
      if (view) setCameraFocusView(view);
    },
    [props.playerID]
  );
  const { handoff, heldNpcs, markTurnShown } = useTurnHandoff({
    currentPlayer,
    active: ctx.phase !== "draft",
    reducedMotion: prefersReducedMotion,
    npcs: G.npcs,
    underway,
    onNextTurn: announceTurn,
  });
  const turnChangeDone = useCallback(() => {
    setShowTurnChange(false);
    markTurnShown();
  }, [markTurnShown]);
  const locked = controlsLocked(handoff);
  const shownNpcs = holdsNpcs(handoff) && heldNpcs ? heldNpcs : G.npcs;

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
  // The first view: the viewer's own ship at ship zoom (the map's middle from
  // its iso distance without one) unless pinned. Only the start changes; the
  // zoom limits and the focus clamp stay as they are, so a pinned view off
  // the map is pulled back onto it like any other.
  const start =
    firstView ??
    openingView({
      ships: G.ships,
      currentPlayer,
      playerID: props.playerID,
      mapView: { target: cam.target, distance: cam.isoDistance },
      pins: { target: cameraTarget, distance: cameraDistance },
    });
  if (!firstView) setFirstView(start);
  const maxMoves = currentShipState ? getMaxMoves(currentShipState) : 0;
  const movesRemaining = maxMoves - (ctx.numMoves ?? 0);

  const inCombat = ctx.phase === "combat" && G.combat;
  // Until the next turn is announced, the HUD stays with the captain whose turn just ended (#216)
  const hudPlayer =
    handoff && handoff.phase !== "nextTurn" && handoff.phase !== "idle" && G.ships[handoff.from] ? handoff.from : currentPlayer;
  const hudShip = G.ships[hudPlayer] ?? currentShipState;

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
        shadows={{ type: SHADOW_MAP_TYPE }}
        camera={{
          // Start due south of the middle of the map (the rectangle's corner
          // is the origin), looking north along CAMERA_DIRECTION
          position: [
            start.target[0] + start.distance * CAMERA_DIRECTION[0],
            start.target[1] + start.distance * CAMERA_DIRECTION[1],
            start.target[2] + start.distance * CAMERA_DIRECTION[2],
          ],
          fov: CAMERA_FOV,
          near: CAMERA_NEAR,
          far: 1000,
        }}
        style={{ background: '#0a1929' }}
      >
        <Scene
          G={G}
          currentPlayer={currentPlayer}
          cam={{ target: start.target }}
          movesRemaining={movesRemaining}
          attackMode={attackMode}
          spyglassMode={spyglassMode}
          attackTargetHexes={attackTargetHexes}
          spyglassTargetHexes={spyglassTargetHexes}
          sinkingShips={sinkingShips}
          npcs={shownNpcs}
          locked={locked}
          hoveredShipId={hoveredShipId}
          hoveredPort={hoveredPort}
          scoutedPlayerIds={currentShipState?.scoutedShips ?? []}
          focusView={cameraFocusView}
          sailing={sailing}
          plannedRoute={plannedRoute}
          shipUnderway={Boolean(underway[currentPlayer])}
          selection={routeSelection}
          onSelect={setRouteSelection}
          onShipUnderway={onShipUnderway}
          onMoveShip={(q, r) => props.moves.moveShip(q, r)}
          onSailRoute={sail}
          onHexClick={spyglassMode ? handleHexClickForSpyglass : handleHexClickForAttack}
          onSinkingComplete={handleSinkingComplete}
          onShipHover={setHoveredShipId}
          onShipClick={(id) => {
            if (id === currentPlayer) {
              setShowDetailsPanel(true);
            }
          }}
          onPortHover={setHoveredPort}
          onCameraCut={cameraCut}
          seaBuoys={seaBuoys ?? false}
        />
        {/* Dev: fps, draw calls and triangles (#162); the DEV guard drops it from production builds */}
        {import.meta.env.DEV && renderStatsFeed && <RenderStatsProbe onStats={renderStatsFeed.publish} />}
        {/* Dev: a seed-gallery shot (#161); the DEV guard drops it from production builds */}
        {import.meta.env.DEV && snapshot && <GallerySnapshot />}
      </Canvas>

      {/* A camera cut (reduced motion, #229) fades in from a veil rather than jumping */}
      {cameraCuts > 0 && (
        <div key={cameraCuts} className="absolute inset-0 pointer-events-none bg-[#0a0e17] opacity-0 animate-camera-cut" />
      )}

      {import.meta.env.DEV && renderStatsFeed && <RenderStatsOverlay feed={renderStatsFeed} />}
      {/* Dev: the seed control (#161); the DEV guard drops it from production builds */}
      {import.meta.env.DEV && !snapshot && G.mapSeed !== undefined && <DevSeedControl mapSize={G.mapSize} mapSeed={G.mapSeed} />}

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
          movesRemaining={hudPlayer === currentPlayer ? movesRemaining : 0}
          maxMoves={hudShip ? getMaxMoves(hudShip) : maxMoves}
          gold={hudShip.gold}
          glory={hudShip.score}
          onEndTurn={() => {
            if (!locked) props.events.endTurn!();
          }}
        />
      )}

      {/* Sound: mute and volume, under the turn bar */}
      {currentShipState && <HudSoundControl />}

      {/* Bottom-left: captain and ship cards on parchment */}
      {currentShipState && (
        <HudParchmentPanel
          ship={hudShip}
          playerIndex={hudPlayer}
          playerColor={PLAYER_COLOURS[hudPlayer] ?? "#888"}
        />
      )}

      {/* Action buttons - only in main phase */}
      {!inCombat && !locked && currentShipState && (hasAttackTargets || hasSpyglassTargets) && (
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

      {/* A route is selected (#213): how to sail it or let it go */}
      {!inCombat &&
        !locked &&
        currentShipState &&
        !sailing &&
        !underway[currentPlayer] &&
        routeSelection?.from === selectionKey(currentPlayer, currentShipState.position) && <RouteHint />}

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

      {/* The outgoing captain's turn ends (#216) */}
      {handoff?.phase === "turnEnded" && G.ships[handoff.from] && (
        <TurnEndedBanner
          captainName={G.ships[handoff.from].captain?.name ?? `Player ${Number(handoff.from) + 1}`}
          reducedMotion={handoff.reducedMotion}
        />
      )}

      {/* Right: Port panel - only in main phase when docked at a port */}
      {!inCombat && !locked && currentShipState && (() => {
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
          playerColor={PLAYER_COLOURS[currentPlayer] ?? "#888888"}
          captain={currentShipState.captain}
          reducedMotion={prefersReducedMotion}
          onComplete={turnChangeDone}
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
