import { useEffect, useState } from "react";
import type { GameClient } from "./loadGameClient";
import { MapLoadingScreen } from "./board/MapLoadingScreen";
import type { RegionBorderMode } from "./board/regionBorderMode";
import type { RenderOff } from "./board/devUrlParams";

interface GameClientLoaderProps {
  client: Promise<GameClient>;
  cameraTarget?: [number, number, number];
  cameraDistance?: number;
  seaBuoys?: boolean;
  /** How the region borders are drawn (dev, #239). */
  regionBorder?: RegionBorderMode;
  /** Parts of the picture left out for an A/B check (`?fx=0`, `?ink=0`, `?bloom=0`, `?post=0`). */
  renderOff?: RenderOff;
  renderStats?: boolean;
  gallerySnapshot?: boolean;
  /** The seat this client holds (the local multi-seat view, #110); none in hotseat. */
  playerID?: string;
}

/** The game once its client (and so its map, #124) is ready; the loading screen until then. */
export function GameClientLoader({ client, cameraTarget, cameraDistance, seaBuoys, regionBorder, renderOff, renderStats, gallerySnapshot, playerID }: GameClientLoaderProps) {
  const [GameClientView, setGameClientView] = useState<GameClient>();

  useEffect(() => {
    let live = true;
    client.then((ready) => {
      // A component is a function, so set it through an updater.
      if (live) setGameClientView(() => ready);
    });
    return () => {
      live = false;
    };
  }, [client]);

  if (!GameClientView) return <MapLoadingScreen />;
  return <GameClientView cameraTarget={cameraTarget} cameraDistance={cameraDistance} seaBuoys={seaBuoys} regionBorder={regionBorder} renderOff={renderOff} renderStats={renderStats} gallerySnapshot={gallerySnapshot} playerID={playerID} />;
}
