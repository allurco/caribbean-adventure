import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import { PerspectiveCamera, Vector3 } from "three";
import type { MapControls as MapControlsType } from "three-stdlib";
import type { BoardProps } from "boardgame.io/react";
import type { CaribbeanState } from "../game/Game";
import { getMaxMoves, movesLeft } from "../game/turnMoves";
import type { Hex } from "../game/hex";
import type { NPCShip, MapCell } from "../game/types";
import { hexToWorld, hexEquals, hexKey, wrapWorldWidth } from "../game/hex";
import { deepSeaHexes } from "../game/deepSea";
import { endTurnSeaWarning, freshSeaWears, seaWearNotices, targetSeaWarning } from "./seaWearView";
import { SeaWearToast } from "./SeaWearToast";
import { HudToastStack } from "./HudToastStack";
import { eventCardShows, eventCardView, eventLogLength, eventLogRows, freshEventCard, lastEventId, type EventCardFace } from "./eventCardView";
import { EventCard } from "./EventCard";
import { HudEventLog } from "./HudEventLog";
import { HudLeftColumn } from "./HudLeftColumn";
import { findAccessiblePort, dockingHexes } from "../game/moves";
import { turnReach, routeTo, reachCost } from "../game/reach";
import { canChooseCombatAction, firstToFireReaches } from "../game/combatMoves";
import { encounterTargets, NO_FIGHTING_IN_PORT } from "./encounterTargets";
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
import { ShipFoamFlecks } from "./ShipFoamFlecks";
import {
  clampFocusToBand,
  groundFootprint,
  mapBand,
  seamAwareStart,
  wrapCopyRange,
} from "./wrapView";
import { openingView, type CameraView } from "./shipView";
import { captainPicked, captainTurnToOpen, helmChanged, helmOf, nextOpening, openingTurnView, turnEndedBannerShows, type Helm, type TurnOf } from "./captainPickTurn";
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
import { RegionBorders } from "./RegionBorders";
import { RegionTooltip } from "./RegionTooltip";
import { useRegionBorders } from "./useRegionBorders";
import { regionAt } from "./regionMap";
import { placeRegionNames } from "./regionNamePlacement";
import { DEFAULT_REGION_BORDER_MODE, type RegionBorderMode } from "./regionBorderMode";
import type { GpuCheck, RenderOff } from "./devUrlParams";
import { PlainRender } from "./visuals/PlainRender";
import { canvasSetup } from "./canvasSetup";
import { GpuInfoProbe } from "./GpuInfoProbe";
import { createGpuInfoFeed, gpuSetupLines } from "./gpuInfo";
import { GpuInfoOverlay } from "./GpuInfoOverlay";
import { useRegionChart } from "./visuals/useRegionChart";
import { useTurnHandoff } from "./useTurnHandoff";
import { controlsLocked, HANDOFF_TIMING, holdsNpcs, turnsInPlay } from "./turnHandoff";
import { TurnEndedBanner } from "./TurnEndedBanner";
import type { Point } from "./shipMotion";
import { ShipTooltip } from "./ShipTooltip";
import { PortTooltip } from "./PortTooltip";
import { ShipDetailsPanel } from "./ShipDetailsPanel";
import { PortPanel } from "./PortPanel";
import { DraftScreen } from "./DraftScreen";
import { sceneStateFor } from "./draftScene";
import { HudGloryBoard } from "./HudGloryBoard";
import {
  combatWaitingFor,
  choosingCaptain,
  draftView,
  fightBystander,
  fightWatched,
  gloryScoreboard,
  hudSeat,
  hudShip,
  isHotseatBoard,
  viewerSeat,
  seatMayAct,
  seatMayActInCombat,
  seatName,
  turnCaptainName,
  waitingFor,
} from "./seat";
import { HudParchmentPanel } from "./HudParchmentPanel";
import { HudShipLost } from "./HudShipLost";
import { isEliminated } from "../game/captainDeath";
import { HudTurnBar } from "./HudTurnBar";
import { CombatPanel } from "./CombatPanel";
import { FightOverPanel } from "./FightOverPanel";
import { boardRefusalIn } from "./boardingText";
import { closeFightOver, fightResultHold, initialFightOver, nextFightOver } from "./fightOverShown";
import { useWhenFightPlayed } from "./combatFx/useWhenFightPlayed";
import { npcKind } from "./npcName";
import { gaugeLine } from "./combatGauge";
import { SCENE_WIND } from "./visuals/sceneWind";
import { GameOverScreen } from "./GameOverScreen";
import { gameOverView } from "./gameOverView";
import { DockingAnimation } from "./DockingAnimation";
import { TurnChangeAnimation } from "./TurnChangeAnimation";
import { MissionCompleteToast } from "./MissionCompleteToast";
import { CameraAudioListener } from "./CameraAudioListener";
import { AmbienceBedDriver } from "./AmbienceBedDriver";
import { HudSoundControl } from "./HudSoundControl";
import { HudSaveLeave } from "./HudSaveLeave";
import { hudStackShows } from "./hudStack";
import { hudStackPresence, portPanelPresence } from "./hudPresence";
import { HUD_EDGE, hudHintTop, hudToastTop } from "./hudLayout";
import { safeInset } from "./safeArea";
import { useShellLayout } from "../online/useShellLayout";
import { RenderStatsProbe } from "./RenderStatsProbe";
import { RenderStatsOverlay } from "./RenderStatsOverlay";
import { DevSeedControl } from "./DevSeedControl";
import { PLAYER_COLOURS } from "./shipOwnerColour";
import { npcShipLook, playerShipLook } from "./shipLook";
import { GallerySnapshot } from "../lab/GallerySnapshot";
import { BoardLoadingVeil } from "./BoardLoadingVeil";
import { SceneReadinessProbe } from "./SceneReadinessProbe";
import { frameOutputFor } from "./shaderWarmUp";
import { useSceneReadiness } from "./useSceneReadiness";
import { STARTER_SHIP_CLASSES } from "../game/types";
import { createRenderStatsFeed } from "./renderStats";
import { useAudioUnlock } from "../audio/useAudioUnlock";
import { useGameSounds } from "../audio/useGameSounds";
import { useCombatFx } from "./combatFx/useCombatFx";
import { CombatEffects } from "./combatFx/CombatEffects";
import { CombatBanner } from "./combatFx/CombatBanner";
import type { CombatDirector } from "./combatFx/combatDirector";
import type { DepartedShipView } from "./combatFx/useCombatFx";
import type { Mission } from "../game/types";
import { ignoredUnderGate } from "../landscape/rotateGatePresence";
import { useRotateGateShowing } from "../landscape/useRotateGateShowing";

/** An Attack or Spyglass button held at port (#388): shown, disabled. */
const HELD_BUTTON = "bg-stone-700/60 text-stone-300/70 border border-stone-600/50 disabled:cursor-not-allowed";


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

/** Nothing left out of the picture, and the GL context as the game sets it up (no A/B switch, canvasSetup.ts). */
const NOTHING_OFF: RenderOff = {};
const NO_GPU_CHECK: GpuCheck = {};

/** A hex whose route shows after a first click, and the `selectionKey` of the ship it was made for. */
interface RouteSelection {
  hex: Hex;
  from: string;
}

function Scene({
  G,
  currentPlayer,
  viewerSeatId,
  cam,
  movesRemaining,
  attackMode,
  spyglassMode,
  attackTargetHexes,
  spyglassTargetHexes,
  sinkingShips,
  combatDirector,
  npcs,
  hoveredShipId,
  hoveredPort,
  scoutedPlayerIds,
  focusView,
  focusCut,
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
  regionBorder,
  renderOff,
  composerMultisampling,
  composerFrameBuffer,
  onReady,
  warmUp,
}: {
  G: CaribbeanState;
  currentPlayer: string;
  /** The viewer's seat (`viewerSeat`, #110), whose ship is "yours": the seat's, or in hotseat the current player's. */
  viewerSeatId: string;
  /** The first target. */
  cam: { target: [number, number, number] };
  movesRemaining: number;
  attackMode: boolean;
  spyglassMode: boolean;
  attackTargetHexes: Hex[];
  spyglassTargetHexes: Hex[];
  /** Ships that left G the fight still shows: going down, or a prize alongside (#263). */
  sinkingShips: DepartedShipView[];
  /** Plays the fight's beats: its effects, its sounds, and where it holds the ships (#263). */
  combatDirector: CombatDirector;
  npcs: Record<string, NPCShip>;
  hoveredShipId: string | null;
  hoveredPort: MapCell | null;
  scoutedPlayerIds: string[];
  /** Where to fly the camera: a new view starts a flight. */
  focusView: CameraView | null;
  /** Go to `focusView` at once instead of flying (the opening view once the draft is over). */
  focusCut: boolean;
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
  /** A departed ship, by its key, is done. */
  onSinkingComplete: (key: string) => void;
  onShipHover: (id: string | null) => void;
  onShipClick: (id: string) => void;
  onPortHover: (cell: MapCell | null) => void;
  /** The camera cut straight to its goal instead of flying (reduced motion, #229). */
  onCameraCut: () => void;
  /** Dev: buoys on the CPU sea surface (#141). */
  seaBuoys: boolean;
  /** How the region borders are drawn: seams in the water or lines (dev, #239). */
  regionBorder: RegionBorderMode;
  /** Parts of the picture left out for an A/B check (`?fx=0`, `?ink=0`, `?bloom=0`, `?post=0`). */
  renderOff: RenderOff;
  /** The composer's multisampling: 0 under `?aa=0` (canvasSetup.ts). */
  composerMultisampling: number;
  /** The composer's buffers: half floats, or full floats under `?bloomhalf=0` (canvasSetup.ts). */
  composerFrameBuffer: "half" | "float";
  /** Reports the loading gate's tasks done here: "world" once built, "sky" once baked (useSceneReadiness.ts). */
  onReady: (task: string) => void;
  /** The loading gate is still open: idle layers stay in the scene so their shaders compile behind it. */
  warmUp: boolean;
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
  // The loading gate: the sky is baked, and the sea that waits on it is mounted
  useEffect(() => {
    if (skyEnvironment) onReady("sky");
  }, [skyEnvironment, onReady]);
  // Children commit before their parent's effects run, so by now the world (terrain, decorations, ports) is built and placed
  useEffect(() => onReady("world"), [onReady]);
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
      flight.current = focusCut ? { kind: "cut" } : null;
    }
  }, [focusView, focusCut]);

  // A fight asks the camera to frame its ships (#263; never under reduced motion)
  useFrame(() => {
    const view = combatDirector.takeCameraRequest();
    if (!view || !controlsRef.current) return;
    targetPosition.current.set(view.target[0], 0, view.target[2]);
    targetDistance.current = Math.min(CAMERA_MAX_DISTANCE, Math.max(CAMERA_MIN_DISTANCE, view.distance));
    isAnimating.current = true;
    flight.current = null;
  });

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
  // The regions (#239): each one's name written into its open water, and
  // the borders between them as a seam in the water or a faint line
  const regionBorderLines = useRegionBorders(G.cells, G.wrap, waveSurface);
  const regionNames = useMemo(() => placeRegionNames(G.cells, G.regions ?? [], G.wrap), [G.cells, G.regions, G.wrap]);
  const regionChart = useRegionChart(G.cells, regionNames, terrainField, regionBorder === "water");
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
  // The region of whatever sea hex is under the pointer, for its tooltip (#239)
  const hoveredRegion = useMemo(() => {
    const hex = grid.hoveredSeaHex;
    const region = hex ? regionAt(G.cells, G.regions ?? [], hex) : undefined;
    return hex && region ? { region, position: hexToWorld(hex) } : null;
  }, [grid.hoveredSeaHex, G.cells, G.regions]);
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
    // Not under the rotate gate (#123): the route sails only once the phone is turned
    const onKey = ignoredUnderGate((e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") onSelect(null);
      if (e.key === "Enter") {
        const route = reachConfirm(reach, selected, hovered);
        if (route.length === 0) return;
        e.preventDefault();
        onSelect(null);
        onSailRoute(route);
      }
    });
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
      {skyEnvironment && !renderOff.ocean && (
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
          regionChart={renderOff.regionInk ? null : regionChart}
          regionSeams={regionBorder === "water"}
        />
      )}

      {/* Dev: buoys on the CPU sea surface, to check it rides the drawn swell (#141) */}
      {seaBuoys && <SeaBuoys />}

      {/* Everything on the map, once per copy of the wrapping world */}
      <WorldCopies period={period} stripMinX={strip?.minX ?? 0} from={copies.from} to={copies.to}>
      {(copy) => (
      <>
      {/* Islands: one continuous mesh from the terrain height field */}
      {!renderOff.land && <LandTerrain terrain={landTerrain} />}

      {/* Terrain decorations: trees, rocks, shore boulders, piers */}
      {!renderOff.land && <TerrainDecorations layout={decorations} waveSlopes={waveSlopes} />}

      <HexGrid grid={grid} copy={copy} />

      {/* The regions' borders as lines, when they are not seams in the water (#239) */}
      {regionBorder === "line" && <RegionBorders lines={regionBorderLines} />}

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
          combatId={id}
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
          combatId={npc.id}
          onUnderway={copy === 0 ? (underway) => onShipUnderway(npc.id, underway) : undefined}
          onPointerEnter={() => onShipHover(npc.id)}
          onPointerLeave={() => onShipHover(null)}
          onClick={() => onShipClick(npc.id)}
        />
      ))}

      {sinkingShips.map((ship) => (
        <SinkingShip
          key={`sinking-${ship.key}`}
          combatId={ship.id}
          report={copy === 0}
          sinks={ship.sinks}
          position={ship.position}
          color={ship.color}
          shipClass={ship.shipClass}
          flag={ship.flag}
          heading={ship.heading}
          onComplete={() => onSinkingComplete(ship.key)}
        />
      ))}
      </>
      )}
      </WorldCopies>

      {/* Foam flecks shed along the ships' waterlines, drawn only close up (#389) */}
      {!renderOff.ocean && <ShipFoamFlecks worldSeed={worldSeed} wrap={Number.isFinite(period) ? period : 0} warm={warmUp} />}

      {/* The fight's smoke, flashes, shot, splinters, spray, foam and grapples (#263) */}
      {!renderOff.combatFx && <CombatEffects director={combatDirector} warm={warmUp} />}

      {/* Ship Tooltip, once, in the copy under the pointer */}
      {hoveredShipId && (G.ships[hoveredShipId] || npcs[hoveredShipId]) && (() => {
        const position = hexToWorld(G.ships[hoveredShipId]?.position ?? npcs[hoveredShipId]?.position);
        return (
        <PointerCopy x={position[0]} period={period}>
        <ShipTooltip
          position={position}
          ship={G.ships[hoveredShipId] ?? npcs[hoveredShipId]}
          isNPC={!!npcs[hoveredShipId]}
          isPlayer={hoveredShipId === viewerSeatId}
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
      {hoveredPort && !hoveredShipId && G.ships[viewerSeatId] && (
        <PointerCopy x={hexToWorld(hoveredPort.hex)[0]} period={period}>
        <PortTooltip
          position={hexToWorld(hoveredPort.hex)}
          nation={hoveredPort.nation}
          portName={hoveredPort.portName}
          hasShipyard={hoveredPort.hasShipyard}
          ship={G.ships[viewerSeatId]}
          market={hoveredPort.market}
          regionName={regionAt(G.cells, G.regions ?? [], hoveredPort.hex)?.name}
        />
        </PointerCopy>
      )}

      {/* The region of the hovered sea hex (#239) */}
      {hoveredRegion && !hoveredShipId && !hoveredPort && (
        <PointerCopy x={hoveredRegion.position[0]} period={period}>
          <RegionTooltip position={hoveredRegion.position} region={hoveredRegion.region} />
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
      {frameOutputFor(renderOff) === "screen" ? (
        <PlainRender />
      ) : (
        <PostEffects
          lighting={lighting}
          withoutBloom={renderOff.bloom === true}
          multisampling={composerMultisampling}
          sanitizeBloomInput={!renderOff.bloomSanitize}
          mipmapBlur={!renderOff.bloomMipmapBlur}
          frameBuffer={composerFrameBuffer}
        />
      )}
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
  /** How the region borders are drawn (dev, #239): `DEFAULT_REGION_BORDER_MODE` when left out. */
  regionBorder?: RegionBorderMode;
  /** Parts of the picture left out for an A/B check on a real GPU (`?fx=0`, `?ink=0`, `?bloom=0`, `?post=0`). */
  renderOff?: RenderOff;
  /** How the GL context is set up, and its on-screen readout (`?dpr=1`, `?power=low`, `?pdb=1`, `?gpuinfo=1`), read in production builds too. */
  gpu?: GpuCheck;
  /** Show the fps, draw calls and triangles readout (dev, #162); ignored in production builds. */
  renderStats?: boolean;
  /** A seed-gallery shot (dev, #161): the draft picks itself and the frame is posted to the gallery; ignored in production builds. */
  gallerySnapshot?: boolean;
  /** Saves the hotseat game and goes back to its start screen (#300); the HUD offers it only when given. */
  onSaveAndLeave?: () => void;
  /** An online match's seats the server saw lately (#114); null while unknown, left out in hotseat and solo. */
  onlineSeats?: readonly string[] | null;
}

export function CaribbeanBoard(props: CaribbeanBoardProps) {
  const { G, ctx, cameraTarget, cameraDistance, seaBuoys, regionBorder, renderOff, gpu, renderStats, gallerySnapshot } = props;
  const snapshot = import.meta.env.DEV && gallerySnapshot === true;
  // Dev seed gallery (#161): each seat takes its first captain and starter ship, so the shot reaches the main phase.
  // Once per seat: StrictMode runs the effect twice, and a second pick for the same seat is an invalid move.
  const { pickCaptain } = props.moves;
  const snapshotPicked = useRef<string | null>(null);
  useEffect(() => {
    if (!snapshot || ctx.phase !== "draft" || snapshotPicked.current === ctx.currentPlayer) return;
    snapshotPicked.current = ctx.currentPlayer;
    pickCaptain(0, STARTER_SHIP_CLASSES[0]);
  }, [snapshot, ctx.phase, ctx.currentPlayer, pickCaptain]);
  // Dev `stats=1` (#162): the probe in the Canvas reports to the overlay through this feed.
  const renderStatsFeed = useMemo(() => (renderStats ? createRenderStatsFeed() : null), [renderStats]);
  // The A/B switches for a real GPU: how the canvas and composer are set up, and `?gpuinfo=1`'s readout
  const setup = useMemo(() => canvasSetup(gpu ?? NO_GPU_CHECK, renderOff ?? NOTHING_OFF), [gpu, renderOff]);
  const gated = useRotateGateShowing();
  const gpuInfoFeed = useMemo(() => (gpu?.info ? createGpuInfoFeed() : null), [gpu?.info]);
  // The loading gate: the board shows once every asset, shader and a few frames are ready
  const portNames = useMemo(() => G.cells.flatMap((c) => (c.portName ? [c.portName] : [])).join(""), [G.cells]);
  const readiness = useSceneReadiness(portNames);
  // The scene is mounted from the start, under the loading screen and then the draft (draftScene.ts)
  const drafting = ctx.phase === "draft";
  const sceneG = useMemo(() => sceneStateFor(G, ctx.phase), [G, ctx.phase]);
  const [attackMode, setAttackMode] = useState(false);
  const [spyglassMode, setSpyglassMode] = useState(false);
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
  const [cameraFocusCut, setCameraFocusCut] = useState(false);
  // Once the draft is over the camera cuts to the opening view, the viewer's own ship
  const wasDrafting = useRef(drafting);
  useEffect(() => {
    if (!wasDrafting.current || drafting) return;
    wasDrafting.current = false;
    const mapCam = computeCameraConfig(getMapPreset(G.mapSize));
    setCameraFocusView(
      openingView({
        ships: G.ships,
        currentPlayer: ctx.currentPlayer,
        playerID: props.playerID,
        mapView: { target: mapCam.target, distance: mapCam.isoDistance },
        pins: { target: cameraTarget, distance: cameraDistance },
      })
    );
    setCameraFocusCut(true);
  }, [drafting, G.ships, G.mapSize, ctx.currentPlayer, props.playerID, cameraTarget, cameraDistance]);
  // The first view, taken once when the main phase starts: MapControls
  // re-aims at its `target` prop whenever that changes.
  const [firstView, setFirstView] = useState<CameraView | null>(null);

  const currentPlayer = ctx.currentPlayer;
  const currentShipState = G.ships[currentPlayer];
  // The client's seat (#110): with one, the board acts only on that seat's
  // turn and shows that seat's own ship; hotseat (no seat) is as before.
  const turn = { playerID: props.playerID, currentPlayer };
  const viewer = viewerSeat(turn);
  const viewerShip = G.ships[viewer];

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

  // The fight on the board (#263): beats, effects and their sounds from each change of G.
  const combatFx = useCombatFx(G, prefersReducedMotion);
  const combatDirector = combatFx.director;

  // Detect when the viewer's own ship docks at a new port
  useEffect(() => {
    if (!viewerShip || ctx.phase === "draft") return;

    const accessiblePort = findAccessiblePort(viewerShip.position, G.cells, G.wrap);
    // Keyed by player: a new turn that starts in port is not an arrival (#216)
    const currentPortId = `${viewer}:${accessiblePort?.portName ?? ""}`;
    const prevPortId = prevPortRef.current;
    if (prevPortId === null || !prevPortId.startsWith(`${viewer}:`)) {
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
  }, [viewerShip?.position, G.cells, G.wrap, ctx.phase, viewerShip, viewer]);

  const inCombat = ctx.phase === "combat" && G.combat;
  // The fight's end (#380): the round that ended it settled itself, so its volleys stay on the board until closed
  const [fightOverView, setFightOverView] = useState(() => initialFightOver(G.lastRound));
  const npcInFight = G.combat?.isNPCCombat ? G.npcs[G.combat.defenderId] : undefined;
  // The last ended round the board has played out (its volleys, the sinking): the panel waits on it
  const [fightPlayedKey, setFightPlayedKey] = useState("");
  const nextFightOverView = nextFightOver(fightOverView, {
    lastRound: G.lastRound,
    inCombat: Boolean(inCombat),
    npcInFight: npcInFight ? npcKind(npcInFight) : null,
    playedKey: fightPlayedKey,
  });
  if (nextFightOverView !== fightOverView) setFightOverView(nextFightOverView);
  const fightOver = nextFightOverView.shown;
  // Opens once the board has played the round out (its volleys, the sinking), as the hand-off waits
  useWhenFightPlayed(nextFightOverView.waitKey || null, combatDirector.holding, HANDOFF_TIMING.fightMax, setFightPlayedKey);
  // In hotseat the next captain's turn waits until this captain closes the fight's end, so it is always read (#380)
  const fightResult = fightResultHold(nextFightOverView, isHotseatBoard(props.playerID, ctx.numPlayers));

  // The hand-off between turns (#216): the outgoing ship arrives, a "turn
  // ends" beat, the NPCs sail, and only then the next turn is announced
  // The turn the hand-off announced, opened as the board renders it (captainPickTurn.ts, #286)
  const [announced, setAnnounced] = useState<string | null>(null);
  const { handoff, heldNpcs, npcsHeld, markTurnShown } = useTurnHandoff({
    currentPlayer,
    turn: ctx.turn,
    fight: ctx.phase === "combat",
    active: turnsInPlay(ctx),
    reducedMotion: prefersReducedMotion,
    npcs: G.npcs,
    underway,
    // A turn that ended in a fight hands off once the board has played its last beats (#380)
    fightPlaying: combatDirector.holding,
    fightResult,
    onNextTurn: setAnnounced,
  });
  const turnChangeDone = useCallback(() => {
    setShowTurnChange(false);
    markTurnShown();
  }, [markTurnShown]);
  // A seat that lost its ship opens its turn after the pick (#286): its new captain's turn waits here for the hand-off
  const helm = helmOf(G, ctx.phase, currentPlayer, ctx.turn);
  const [lastHelm, setLastHelm] = useState<Helm | null>(null);
  const [newCaptainTurn, setNewCaptainTurn] = useState<TurnOf | null>(null);
  if (helmChanged(lastHelm, helm)) {
    setLastHelm(helm);
    if (captainPicked(lastHelm, helm)) setNewCaptainTurn({ player: helm.player, turn: helm.turn });
  }
  // Where the camera flies once the fight lets go of it (#263): it stays on
  // the two ships the fight framed, the sinking included, until then
  const [pendingFlight, setPendingFlight] = useState<CameraView | null>(null);
  // Opening a turn: the "Your turn" banner, and the camera to the ship (openingTurnView)
  const opening = nextOpening({ announced, newCaptain: newCaptainTurn }, helm, handoff);
  if (opening.kind === "drop") {
    if (opening.which === "announced") setAnnounced(null);
    else setNewCaptainTurn(null);
  }
  if (opening.kind === "open") {
    setAnnounced(null);
    setNewCaptainTurn(null);
    setShowTurnChange(true);
    const view = openingTurnView({ ships: G.ships, currentPlayer: opening.player, playerID: props.playerID }, opening.newCaptain);
    if (view) setPendingFlight(view);
  }
  const inFightRef = useRef(G.combat !== undefined);
  useEffect(() => {
    inFightRef.current = G.combat !== undefined;
  }, [G.combat]);
  useWhenFightPlayed(
    pendingFlight,
    () => inFightRef.current || combatDirector.holding(),
    Infinity,
    (view) => {
      setCameraFocusView(view);
      setCameraFocusCut(false);
      setPendingFlight(null);
    },
  );
  const locked = controlsLocked(handoff);
  // The board takes this client's moves now: its seat's turn (#110), and no hand-off under way (#216)
  const boardActive = seatMayAct(turn) && !locked;
  const shownNpcs = holdsNpcs(handoff) && heldNpcs ? heldNpcs : G.npcs;
  // The event log as the NPCs on show have it: while the hand-off holds the
  // old NPCs, the events of the turn that just ended wait with them (#246)
  // (`npcsHeld` is true from the very render the turn passes in, before the hand-off starts)
  const [releasedEventLog, setReleasedEventLog] = useState(G.eventDeck?.log);
  if (!npcsHeld && releasedEventLog !== G.eventDeck?.log) setReleasedEventLog(G.eventDeck?.log);
  const shownEventLog = npcsHeld ? releasedEventLog : G.eventDeck?.log;

  // The open sea (#340): the map's deep sea, found once per map, for the
  // warnings; and a line for the table when it wears a
  // ship as its turn ends. Not for a wear already in G on load.
  const deepSea = useMemo(() => new Set(deepSeaHexes(G.cells, G.wrap).map(hexKey)), [G.cells, G.wrap]);
  const [seenSeaWear, setSeenSeaWear] = useState(G.seaWear);
  const [seaWearLines, setSeaWearLines] = useState<string[] | null>(null);
  const newSeaWears = freshSeaWears(seenSeaWear, G.seaWear);
  if (newSeaWears.length > 0) {
    setSeenSeaWear(G.seaWear);
    setSeaWearLines(seaWearNotices(newSeaWears, { playerID: props.playerID, numPlayers: ctx.numPlayers, ships: G.ships }));
  }
  const clearSeaWearLines = useCallback(() => setSeaWearLines(null), []);

  // The event deck (#246): the card drawn as a turn ends, shown to every
  // player unless it is Calm seas; not for one already in G on load
  const [seenEventId, setSeenEventId] = useState(() => lastEventId(G.eventDeck?.log));
  const [eventCard, setEventCard] = useState<EventCardFace | null>(null);
  const latestEventId = lastEventId(G.eventDeck?.log);
  if (latestEventId !== seenEventId) {
    const fresh = freshEventCard(seenEventId, G.eventDeck?.log);
    setSeenEventId(latestEventId);
    if (fresh) setEventCard(eventCardView(fresh, G.regions));
  }
  const clearEventCard = useCallback(() => setEventCard(null), []);

  // Detect mission completion
  useEffect(() => {
    const prev = prevMissionRef.current;
    // The viewer's own: a rival's mission is hidden from a seat (playerView, #109)
    const currentMission = viewerShip?.activeMission;

    // Only detect completion if we're still the same player
    // This prevents false triggers when turn changes to a different player
    if (
      prev &&
      prev.playerId === viewer &&
      prev.mission &&
      prev.mission.status === "ACTIVE" &&
      !currentMission
    ) {
      const completedMissionData = prev.mission;
      const timer = setTimeout(() => {
        setCompletedMission({ ...completedMissionData, status: "COMPLETED" });
      }, 0);
      prevMissionRef.current = { mission: currentMission, playerId: viewer };
      return () => clearTimeout(timer);
    }

    prevMissionRef.current = { mission: currentMission, playerId: viewer };
  }, [viewerShip?.activeMission, viewer]);


  // Attack and spyglass targets (players + NPCs), none to or from a port (#388) - must be before early return
  const encounters = useMemo(
    () => encounterTargets({ cells: G.cells, wrap: G.wrap, ships: G.ships, npcs: G.npcs }, currentPlayer),
    [G.cells, G.wrap, G.ships, G.npcs, currentPlayer],
  );
  const attackTargetIds = encounters.attack.players;
  const npcAttackTargetIds = encounters.attack.npcs;
  const spyglassTargets = encounters.scout;

  const attackTargetHexes = useMemo(() => {
    const playerHexes = attackTargetIds.map((id) => G.ships[id]?.position).filter(Boolean) as Hex[];
    const npcHexes = npcAttackTargetIds.map((id) => G.npcs[id]?.position).filter(Boolean) as Hex[];
    return [...playerHexes, ...npcHexes];
  }, [attackTargetIds, npcAttackTargetIds, G.ships, G.npcs]);

  const hasAttackTargets = attackTargetIds.length > 0 || npcAttackTargetIds.length > 0;

  const spyglassTargetHexes = useMemo(() => {
    const playerHexes = spyglassTargets.players.map((id) => G.ships[id]?.position).filter(Boolean) as Hex[];
    const npcHexes = spyglassTargets.npcs.map((id) => G.npcs[id]?.position).filter(Boolean) as Hex[];
    return [...playerHexes, ...npcHexes];
  }, [spyglassTargets, G.ships, G.npcs]);

  const hasSpyglassTargets = spyglassTargets.players.length > 0 || spyglassTargets.npcs.length > 0;

  const preset = getMapPreset(G.mapSize);
  const cam = computeCameraConfig(preset);
  // The first view: the viewer's own ship at ship zoom (the map's middle from
  // its iso distance without one) unless pinned. Only the start changes; the
  // zoom limits and the focus clamp stay as they are, so a pinned view off
  // the map is pulled back onto it like any other.
  const start =
    firstView ??
    openingView({
      ships: sceneG.ships,
      currentPlayer,
      playerID: props.playerID,
      mapView: { target: cam.target, distance: cam.isoDistance },
      pins: { target: cameraTarget, distance: cameraDistance },
    });
  if (!firstView) setFirstView(start);
  const maxMoves = currentShipState ? getMaxMoves(currentShipState) : 0;
  // Only sailing, scouting and jury-rigging use moves; port actions are free (#227)
  const movesRemaining = movesLeft(G, currentPlayer);

  // Whether the HUD's top-left stack shows, for the harbour link over the board (#125): it sits beside the stack on a phone
  const hudStackUp = hudStackShows(G, ctx);
  useEffect(() => (hudStackUp ? hudStackPresence.show() : undefined), [hudStackUp]);
  // The port panel: only in the main phase, when the current ship is docked; the harbour link keeps clear of it (#125)
  const dockedPort =
    !inCombat && boardActive && currentShipState
      ? findAccessiblePort(currentShipState.position, G.cells, G.wrap)
      : undefined;
  const portMarket = dockedPort?.market;
  const portPanelOpen = portMarket !== undefined;
  useEffect(() => (portPanelOpen ? portPanelPresence.show() : undefined), [portPanelOpen]);
  // The centred hint band, below the harbour link on a phone (#125)
  const { layout: hudLayoutKind } = useShellLayout();
  // Until the next turn is announced, the HUD stays with the captain whose turn just ended (#216)
  // A seat's HUD shows its own ship always: a rival's purse reaches it emptied (#110)
  const hudPlayer = hudSeat({ ...turn, handoff, ships: G.ships });
  // Null once the seat's ship is gone: the HUD shows the loss, never a rival's ship in its place
  const shownShip = hudShip(G, hudPlayer);

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
        // No frames under the rotate gate (#123). On resuming, R3F restarts its
        // clock, so the first frame's delta is near zero, not the time away;
        // the wave, surf and sway clocks clamp their steps besides.
        frameloop={gated ? "never" : "always"}
        dpr={setup.dpr}
        gl={setup.gl}
        shadows={setup.shadows ? { type: SHADOW_MAP_TYPE } : false}
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
          G={sceneG}
          currentPlayer={currentPlayer}
          viewerSeatId={viewer}
          cam={{ target: start.target }}
          movesRemaining={movesRemaining}
          attackMode={attackMode}
          spyglassMode={spyglassMode}
          attackTargetHexes={attackTargetHexes}
          // Another seat's scouting reach is not this seat's to offer (#110)
          spyglassTargetHexes={boardActive ? spyglassTargetHexes : []}
          sinkingShips={combatFx.departed}
          combatDirector={combatFx.director}
          npcs={shownNpcs}
          // Another seat's turn locks the board like a hand-off does (#110)
          locked={!boardActive || drafting}
          hoveredShipId={hoveredShipId}
          hoveredPort={hoveredPort}
          // The viewer's spyglass: a rival's scouting reveals nothing to this seat (#110)
          scoutedPlayerIds={viewerShip?.scoutedShips ?? []}
          focusView={cameraFocusView}
          focusCut={cameraFocusCut}
          sailing={sailing}
          plannedRoute={plannedRoute}
          shipUnderway={Boolean(underway[currentPlayer])}
          selection={routeSelection}
          onSelect={setRouteSelection}
          onShipUnderway={onShipUnderway}
          onMoveShip={(q, r) => props.moves.moveShip(q, r)}
          onSailRoute={sail}
          onHexClick={spyglassMode ? handleHexClickForSpyglass : handleHexClickForAttack}
          onSinkingComplete={combatFx.finishDeparted}
          onShipHover={setHoveredShipId}
          onShipClick={(id) => {
            if (id === viewer) {
              setShowDetailsPanel(true);
            }
          }}
          onPortHover={setHoveredPort}
          onCameraCut={cameraCut}
          seaBuoys={seaBuoys ?? false}
          regionBorder={regionBorder ?? DEFAULT_REGION_BORDER_MODE}
          renderOff={renderOff ?? NOTHING_OFF}
          composerMultisampling={setup.composerMultisampling}
          composerFrameBuffer={setup.composerFrameBuffer}
          onReady={readiness.complete}
          warmUp={!readiness.view.ready}
        />
        <SceneReadinessProbe
          compileShaders={readiness.view.compileShaders}
          frameOutput={frameOutputFor(renderOff ?? NOTHING_OFF)}
          shadersCompiled={readiness.view.stage === "frames"}
          countFrames={readiness.view.stage === "frames" && !readiness.view.ready}
          complete={readiness.complete}
          fail={readiness.fail}
          frame={readiness.frame}
        />
        {/* Dev: fps, draw calls and triangles (#162); the DEV guard drops it from production builds */}
        {import.meta.env.DEV && renderStatsFeed && !gpuInfoFeed && <RenderStatsProbe onStats={renderStatsFeed.publish} />}
        {/* `?gpuinfo=1`: the GL context and its frames, read in production builds too; it stands in for the stats probe */}
        {gpuInfoFeed && <GpuInfoProbe feed={gpuInfoFeed} onStats={renderStatsFeed?.publish} />}
        {/* Dev: a seed-gallery shot (#161); the DEV guard drops it from production builds */}
        {import.meta.env.DEV && snapshot && <GallerySnapshot ready={readiness.view.ready && !drafting} />}
      </Canvas>

      {/* The captain draft, over the finished scene once the loading screen has gone; and a new captain for a lost ship (#265) */}
      {choosingCaptain(G, ctx.phase, ctx.currentPlayer) && (
        <div className="absolute inset-0 z-[55]">
          <DraftScreen
            view={draftView(G, turn)}
            drafting={seatName(G, viewerSeat(turn))}
            onPickCaptain={(index, shipClass) => props.moves.pickCaptain(index, shipClass)}
          />
        </div>
      )}

      {/* The loading screen from page load until every asset, shader and a few frames are ready, then faded out */}
      <BoardLoadingVeil view={readiness.view} />

      {/* The HUD and panels, once the draft is over */}
      {!drafting && (
      <>

      {/* A camera cut (reduced motion, #229) fades in from a veil rather than jumping */}
      {cameraCuts > 0 && (
        <div key={cameraCuts} className="absolute inset-0 pointer-events-none bg-[#0a0e17] opacity-0 animate-camera-cut" />
      )}

      {import.meta.env.DEV && renderStatsFeed && <RenderStatsOverlay feed={renderStatsFeed} />}
      {gpuInfoFeed && (
        <GpuInfoOverlay
          feed={gpuInfoFeed}
          setupLines={gpuSetupLines(gpu ?? NO_GPU_CHECK, renderOff ?? NOTHING_OFF, setup)}
        />
      )}
      {/* Dev: the seed control (#161); the DEV guard drops it from production builds */}
      {import.meta.env.DEV && !snapshot && G.mapSeed !== undefined && <DevSeedControl mapSize={G.mapSize} mapSeed={G.mapSeed} />}

      {/* A word over the fight: escaped, caught (#263) */}
      <CombatBanner text={combatFx.banner} />

      {/* Combat Panel */}
      {inCombat && G.combat && (
        <CombatPanel
          combat={G.combat}
          ships={G.ships}
          npcs={G.npcs}
          onRollSeamanship={() => props.moves.rollSeamanship()}
          onRollDefenderSeamanship={() => props.moves.rollDefenderSeamanship()}
          onChooseAction={(action) => props.moves.chooseCombatAction(action)}
          onRollFleeAttempt={() => props.moves.rollFleeAttempt()}
          // One Fire! for every volley: its hits land at random, and the round settles itself (#380)
          onRollCannons={() => props.moves.rollCannons()}
          onReturnFire={() => props.moves.returnFire()}
          onFightBoarding={() => props.moves.fightBoarding()}
          onApplyResolution={() => props.moves.applyResolution()}
          boardRefusal={boardRefusalIn(G)}
          lastRound={G.lastRound}
          // A ship out of range never fires first (#356)
          mayChooseFire={canChooseCombatAction(G, "fire")}
          firstToFireReaches={firstToFireReaches(G)}
          // Only the seat whose step it is presses it (each captain its own die of the draw, then the faster ship)
          mayAct={seatMayActInCombat({ playerID: props.playerID, combat: G.combat })}
          waitingLine={combatWaitingFor(G, { playerID: props.playerID, combat: G.combat })}
          watchingLine={fightBystander(props.playerID, G.combat) ? fightWatched(G, G.combat) : null}
          gaugeLine={gaugeLine(G, G.combat, SCENE_WIND)}
        />
      )}

      {!inCombat && fightOver && (
        <FightOverPanel settled={fightOver} npcLabel={nextFightOverView.npcLabel} onClose={() => setFightOverView(closeFightOver)} />
      )}

      {/* Top bar - only show in main phase */}
      {!inCombat && currentShipState && (
        <HudTurnBar
          mapLabel={preset.label}
          movesRemaining={hudPlayer === currentPlayer ? movesRemaining : 0}
          maxMoves={shownShip ? getMaxMoves(shownShip) : maxMoves}
          turnOpen={boardActive && hudPlayer === currentPlayer}
          gold={shownShip?.gold ?? null}
          glory={shownShip?.score ?? null}
          waitingLine={waitingFor(G, turn)}
          seaWarning={endTurnSeaWarning(G, currentShipState, deepSea)}
          onEndTurn={() => {
            if (boardActive) props.events.endTurn!();
          }}
        />
      )}

      {/* Sound: mute and volume, under the turn bar */}
      {currentShipState && <HudSoundControl />}
      {/* A finished match is not saved (its save is cleared), so there is nothing to leave and come back to */}
      {props.onSaveAndLeave && !ctx.gameover && <HudSaveLeave onSaveAndLeave={props.onSaveAndLeave} />}

      {/* Every captain's glory, which is public (#110), and the last few events (#246) */}
      {!inCombat && currentShipState && (
        <HudLeftColumn>
          <HudGloryBoard rows={gloryScoreboard(G, hudPlayer, props.onlineSeats)} colours={PLAYER_COLOURS} />
          <HudEventLog rows={eventLogRows(shownEventLog, G.regions, eventLogLength(hudLayoutKind), (seat) => turnCaptainName(G, seat))} />
        </HudLeftColumn>
      )}

      {/* Bottom-left: captain and ship cards on parchment */}
      {currentShipState && shownShip && (
        <HudParchmentPanel
          ship={shownShip}
          playerIndex={hudPlayer}
          playerColor={PLAYER_COLOURS[hudPlayer] ?? "#888"}
        />
      )}
      {currentShipState && !shownShip && (
        <HudShipLost name={seatName(G, hudPlayer)} playerColor={PLAYER_COLOURS[hudPlayer] ?? "#888"} out={isEliminated(G, hudPlayer)} />
      )}

      {/* Action buttons - only in main phase */}
      {!inCombat && boardActive && currentShipState && (hasAttackTargets || hasSpyglassTargets || encounters.held.attack || encounters.held.scout) && (
        <div className="absolute flex gap-2 items-center" style={{ bottom: safeInset("bottom", HUD_EDGE), right: safeInset("right", HUD_EDGE) }}>
          {/* Docked with a ship in reach (#388): the held buttons show, disabled, with the reason */}
          {(encounters.held.attack || encounters.held.scout) && (
            <span className="font-heading text-xs text-amber-100/90 bg-black/50 rounded px-2 py-1">{NO_FIGHTING_IN_PORT}</span>
          )}
          {/* Spyglass button */}
          {(hasSpyglassTargets || encounters.held.scout) && (
            <button
              disabled={encounters.held.scout}
              title={encounters.held.scout ? NO_FIGHTING_IN_PORT : undefined}
              onClick={() => {
                setSpyglassMode(!spyglassMode);
                if (!spyglassMode) setAttackMode(false);
              }}
              className={`font-heading py-3 px-6 rounded-lg text-sm font-bold cursor-pointer transition-colors uppercase tracking-wider ${
                encounters.held.scout
                  ? HELD_BUTTON
                  : spyglassMode
                  ? "bg-cyan-600 hover:bg-cyan-500 text-white border-2 border-cyan-400"
                  : "bg-cyan-800/70 hover:bg-cyan-700/70 text-cyan-100 border border-cyan-700/50"
              }`}
            >
              {spyglassMode ? "Cancel Scout" : "Spyglass"}
            </button>
          )}
          {/* Attack button */}
          {(hasAttackTargets || encounters.held.attack) && (
            <button
              disabled={encounters.held.attack}
              title={encounters.held.attack ? NO_FIGHTING_IN_PORT : undefined}
              onClick={() => {
                setAttackMode(!attackMode);
                if (!attackMode) setSpyglassMode(false);
              }}
              className={`font-heading py-3 px-6 rounded-lg text-sm font-bold cursor-pointer transition-colors uppercase tracking-wider ${
                encounters.held.attack
                  ? HELD_BUTTON
                  : attackMode
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
        boardActive &&
        currentShipState &&
        !sailing &&
        !underway[currentPlayer] &&
        routeSelection?.from === selectionKey(currentPlayer, currentShipState.position) && (
          <RouteHint top={hudHintTop(hudLayoutKind)} warning={targetSeaWarning(G, currentShipState, routeSelection.hex, deepSea)} />
        )}

      {/* Attack mode indicator */}
      {attackMode && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-red-900/90 text-red-100 px-4 py-2 rounded-lg text-sm border border-red-700"
          style={{ top: safeInset("top", hudHintTop(hudLayoutKind)) }}
        >
          Select an enemy ship to attack (red hexes)
        </div>
      )}

      {/* Spyglass mode indicator */}
      {spyglassMode && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-cyan-900/90 text-cyan-100 px-4 py-2 rounded-lg text-sm border border-cyan-700"
          style={{ top: safeInset("top", hudHintTop(hudLayoutKind)) }}
        >
          Select a ship to scout with your spyglass (red hexes)
        </div>
      )}

      {/* The outgoing captain's turn ends (#216) */}
      {handoff && turnEndedBannerShows(handoff, G.ships, choosingCaptain(G, ctx.phase, ctx.currentPlayer)) && (
        <TurnEndedBanner
          captainName={G.ships[handoff.from].captain?.name ?? `Player ${Number(handoff.from) + 1}`}
          reducedMotion={handoff.reducedMotion}
        />
      )}

      {/* Right: Port panel - only in main phase when docked at a port */}
      {dockedPort && portMarket && currentShipState && (
          <PortPanel
            ship={currentShipState}
            market={portMarket}
            portNation={dockedPort.nation}
            portName={dockedPort.portName}
            hasShipyard={dockedPort.hasShipyard}
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
      )}

      {/* Ship Details Panel */}
      {showDetailsPanel && viewerShip && (
        <ShipDetailsPanel
          ship={viewerShip}
          onClose={() => setShowDetailsPanel(false)}
          onStashGold={boardActive ? (amount) => props.moves.stashGold(amount) : undefined}
        />
      )}

      {/* The toasts, stacked: a mission completed, then the open sea wearing a ship as its turn ended (#340) */}
      {(completedMission || seaWearLines) && (
        <HudToastStack top={hudToastTop(hudLayoutKind)}>
          {completedMission && (
            <MissionCompleteToast
              title={completedMission.title}
              reward={completedMission.reward}
              onComplete={() => setCompletedMission(null)}
            />
          )}
          {seaWearLines && <SeaWearToast lines={seaWearLines} onDone={clearSeaWearLines} />}
        </HudToastStack>
      )}

      {/* The event card drawn as the last turn ended (#246), for every player, once the turn's hand-off is over and a new captain's turn has opened (#372) */}
      {eventCard && eventCardShows({
          handoff,
          turnChangeShowing: showTurnChange,
          gameOver: ctx.gameover !== undefined,
          captainTurnPending: captainTurnToOpen(helm, newCaptainTurn),
        }) && (
        <EventCard card={eventCard} onDone={clearEventCard} />
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
          view={gameOverView(ctx.gameover, ctx.numPlayers, props.playerID ?? null)}
          onPlayAgain={() => window.location.reload()}
        />
      )}
      </>
      )}
    </div>
  );
}
