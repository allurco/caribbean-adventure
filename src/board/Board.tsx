import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import type { BoardProps } from "boardgame.io/react";
import type { CaribbeanState } from "../game/Game";
import { getMaxMoves } from "../game/Game";
import type { Terrain } from "../game/terrain";
import { hexToWorld, hexEquals } from "../game/hex";
import { validMoveTargets } from "../game/moves";
import { getMapPreset, computeCameraConfig } from "../game/mapConfig";
import type { CameraConfig } from "../game/mapConfig";
import { HexGrid } from "./HexGrid";
import { Ship } from "./Ship";
import { PortPanel } from "./PortPanel";
import { DraftScreen } from "./DraftScreen";
import { HudCaptainCard } from "./HudCaptainCard";
import { HudShipCard } from "./HudShipCard";
import { HudTurnBar } from "./HudTurnBar";

const TERRAIN_COLORS: Record<Terrain, string> = {
  water: "#1a3a5c",
  island: "#2a7a3a",
};

const PORT_COLOR = "#c0a060";

const PLAYER_COLORS: Record<string, string> = {
  "0": "#3b82f6", // blue
  "1": "#ef4444", // red
};

function Scene({
  G,
  currentPlayer,
  cam,
  movesRemaining,
  onMoveShip,
}: {
  G: CaribbeanState;
  currentPlayer: string;
  cam: CameraConfig;
  movesRemaining: number;
  onMoveShip: (q: number, r: number) => void;
}) {
  const currentShipState = G.ships[currentPlayer];
  const otherShipPositions = useMemo(
    () =>
      Object.entries(G.ships)
        .filter(([id]) => id !== currentPlayer)
        .map(([, s]) => s.position),
    [G.ships, currentPlayer]
  );
  const targets = useMemo(
    () => validMoveTargets(currentShipState.position, G.cells, otherShipPositions),
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
        validTargets={movesRemaining > 0 ? targets : []}
        onHexClick={(h) => onMoveShip(h.q, h.r)}
        interactive={movesRemaining > 0}
      />

      {Object.entries(G.ships).map(([id, ship]) => (
        <Ship
          key={id}
          position={hexToWorld(ship.position)}
          color={PLAYER_COLORS[id] ?? "#888888"}
          shipClass={ship.shipClass}
        />
      ))}

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
  const currentPlayer = ctx.currentPlayer;
  const currentShipState = G.ships[currentPlayer];
  const maxMoves = getMaxMoves(currentShipState);
  const movesRemaining = maxMoves - ctx.numMoves!;
  const currentCell = G.cells.find((c) =>
    hexEquals(c.hex, currentShipState.position),
  );

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
          onMoveShip={(q, r) => props.moves.moveShip(q, r)}
        />
      </Canvas>

      {/* Top bar */}
      <HudTurnBar
        mapLabel={preset.label}
        movesRemaining={movesRemaining}
        maxMoves={maxMoves}
        gold={currentShipState.gold}
        onEndTurn={() => props.events.endTurn!()}
      />

      {/* Bottom-left: unified HUD panel */}
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

      {/* Right: Port panel */}
      {currentCell?.hasPort && currentCell.market && (
        <PortPanel
          ship={currentShipState}
          market={currentCell.market}
          onTrade={(good, amount, action) =>
            props.moves.trade(good, amount, action)
          }
          onBuyUpgrade={(upgradeId) =>
            props.moves.buyUpgrade(upgradeId)
          }
          onRepair={(category, points) =>
            props.moves.repair(category, points)
          }
        />
      )}
    </div>
  );
}
