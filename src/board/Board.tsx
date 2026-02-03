import { useMemo, useState, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import type { BoardProps } from "boardgame.io/react";
import type { CaribbeanState } from "../game/Game";
import { getMaxMoves } from "../game/Game";
import type { Terrain } from "../game/terrain";
import type { Hex } from "../game/hex";
import type { ShipState, ShipClass, NPCShip, MapCell } from "../game/types";
import { hexToWorld, hexEquals } from "../game/hex";
import { validMoveTargets } from "../game/moves";
import { getValidAttackTargets, getValidNPCAttackTargets } from "../game/combat";
import { getValidScoutTargets } from "../game/scouting";
import { getMapPreset, computeCameraConfig } from "../game/mapConfig";
import type { CameraConfig } from "../game/mapConfig";
import { HexGrid } from "./HexGrid";
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

interface SinkingShipData {
  id: string;
  position: [number, number, number];
  color: string;
  shipClass?: ShipClass;
}

const TERRAIN_COLORS: Record<Terrain, string> = {
  water: "#1a3a5c",
  island: "#2a7a3a",
};

const PORT_COLOR = "#c0a060";

const PLAYER_COLORS: Record<string, string> = {
  "0": "#3b82f6", // blue
  "1": "#ef4444", // red
};

const NPC_MERCHANT_COLOR = "#d4a574"; // tan/beige for merchant ships
const NPC_FLOTILLA_COLOR = "#8b0000"; // dark red for military/flotilla ships

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
  onMoveShip,
  onHexClick,
  onSinkingComplete,
  onShipHover,
  onShipClick,
  onPortHover,
}: {
  G: CaribbeanState;
  currentPlayer: string;
  cam: CameraConfig;
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
  onMoveShip: (q: number, r: number) => void;
  onHexClick: (hex: Hex) => void;
  onSinkingComplete: (id: string) => void;
  onShipHover: (id: string | null) => void;
  onShipClick: (id: string) => void;
  onPortHover: (cell: MapCell | null) => void;
}) {
  const currentShipState = G.ships[currentPlayer];

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
  const targets = useMemo(
    () => currentShipState
      ? validMoveTargets(currentShipState.position, G.cells, otherShipPositions)
      : [],
    [currentShipState, G.cells, otherShipPositions]
  );

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1} />

      <HexGrid
        cells={G.cells}
        terrainColors={TERRAIN_COLORS}
        portColor={PORT_COLOR}
        validTargets={attackMode || spyglassMode ? [] : (movesRemaining > 0 ? targets : [])}
        attackTargets={attackMode ? attackTargetHexes : (spyglassMode ? spyglassTargetHexes : [])}
        onHexClick={(h) => {
          if (attackMode || spyglassMode) {
            onHexClick(h);
          } else {
            onMoveShip(h.q, h.r);
          }
        }}
        onPortHover={onPortHover}
        interactive={attackMode || spyglassMode || movesRemaining > 0}
      />

      {Object.entries(G.ships).map(([id, ship]) => (
        <Ship
          key={id}
          position={hexToWorld(ship.position)}
          color={PLAYER_COLORS[id] ?? "#888888"}
          shipClass={ship.shipClass}
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

      {/* Ship Tooltip */}
      {hoveredShipId && (G.ships[hoveredShipId] || npcs[hoveredShipId]) && (
        <ShipTooltip
          position={hexToWorld(
            G.ships[hoveredShipId]?.position ?? npcs[hoveredShipId]?.position
          )}
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
      )}

      {/* Port Tooltip */}
      {hoveredPort && !hoveredShipId && G.ships[currentPlayer] && (
        <PortTooltip
          position={hexToWorld(hoveredPort.hex)}
          nation={hoveredPort.nation}
          portName={hoveredPort.portName}
          hasShipyard={hoveredPort.hasShipyard}
          ship={G.ships[currentPlayer]}
          market={hoveredPort.market}
        />
      )}

      <MapControls
        makeDefault
        enableRotate={false}
        minDistance={cam.minDistance}
        maxDistance={cam.maxDistance}
      />
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

  const currentPlayer = ctx.currentPlayer;
  const currentShipState = G.ships[currentPlayer];

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

  const handleSinkingComplete = (id: string) => {
    setSinkingShips((prev) => prev.filter((s) => s.id !== id));
  };

  // Calculate potential attack targets (players + NPCs) - must be before early return
  const attackTargetIds = useMemo(() => {
    if (!currentShipState) return [];
    return getValidAttackTargets(currentShipState, G.ships, currentPlayer);
  }, [currentShipState, G.ships, currentPlayer]);

  const npcAttackTargetIds = useMemo(() => {
    if (!currentShipState) return [];
    return getValidNPCAttackTargets(currentShipState, G.npcs);
  }, [currentShipState, G.npcs]);

  const attackTargetHexes = useMemo(() => {
    const playerHexes = attackTargetIds.map((id) => G.ships[id]?.position).filter(Boolean) as Hex[];
    const npcHexes = npcAttackTargetIds.map((id) => G.npcs[id]?.position).filter(Boolean) as Hex[];
    return [...playerHexes, ...npcHexes];
  }, [attackTargetIds, npcAttackTargetIds, G.ships, G.npcs]);

  const hasAttackTargets = attackTargetIds.length > 0 || npcAttackTargetIds.length > 0;

  // Calculate spyglass targets
  const spyglassTargets = useMemo(() => {
    if (!currentShipState) return { players: [], npcs: [] };
    return getValidScoutTargets(currentShipState, currentPlayer, G.ships, G.npcs);
  }, [currentShipState, currentPlayer, G.ships, G.npcs]);

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
  const cam = computeCameraConfig(preset.radius);
  const maxMoves = currentShipState ? getMaxMoves(currentShipState) : 0;
  const movesRemaining = maxMoves - (ctx.numMoves ?? 0);
  const currentCell = currentShipState
    ? G.cells.find((c) => hexEquals(c.hex, currentShipState.position))
    : undefined;

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
    <div className="relative w-screen h-screen font-body">
      <Canvas
        camera={{
          position: [0, cam.height, cam.offset],
          fov: 50,
        }}
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

      {/* Right: Port panel - only in main phase */}
      {!inCombat && currentCell?.hasPort && currentCell.market && currentShipState && (
        <PortPanel
          ship={currentShipState}
          market={currentCell.market}
          portNation={currentCell.nation}
          portName={currentCell.portName}
          hasShipyard={currentCell.hasShipyard}
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
        />
      )}

      {/* Ship Details Panel */}
      {showDetailsPanel && currentShipState && (
        <ShipDetailsPanel
          ship={currentShipState}
          onClose={() => setShowDetailsPanel(false)}
          onStashGold={(amount) => props.moves.stashGold(amount)}
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
