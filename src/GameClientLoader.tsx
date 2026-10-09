import { useEffect, useState } from "react";
import type { GameClient } from "./loadGameClient";
import { MapLoadingScreen } from "./board/MapLoadingScreen";

interface GameClientLoaderProps {
  client: Promise<GameClient>;
  cameraTarget?: [number, number, number];
  cameraDistance?: number;
}

/** The game once its client (and so its map, #124) is ready; the loading screen until then. */
export function GameClientLoader({ client, cameraTarget, cameraDistance }: GameClientLoaderProps) {
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
  return <GameClientView cameraTarget={cameraTarget} cameraDistance={cameraDistance} />;
}
