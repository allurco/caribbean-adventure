import { useEffect, useState, type ComponentType } from "react";
import { Client } from "boardgame.io/react";
import { CaribbeanBoard } from "../board/Board";
import { Caribbean } from "../game/Game";
import { withSeatedCombat } from "../game/seatedCombat";
import { apiTransport } from "./apiTransport";
import type { MatchSyncApi } from "./matchSync";

export type OnlineMatchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; MatchClient: ComponentType<{ playerID: string; matchID: string }>; seat: string; matchId: string };

/**
 * The seat's board for an online match (#113): reads the seat's view once,
 * then mounts boardgame.io's client on it with the `/api` transport. The
 * game's rules run on the server; the client never sees more than its seat's
 * view. `onError` hears why an order was refused.
 */
export function useOnlineMatch(api: MatchSyncApi, matchId: string | null, onError: (message: string) => void): OnlineMatchState {
  const [state, setState] = useState<OnlineMatchState>(
    matchId ? { status: "loading" } : { status: "error", error: "That match link is not complete." },
  );
  useEffect(() => {
    if (!matchId) return;
    let live = true;
    void api.getMatch(matchId).then((result) => {
      if (!live) return;
      if (!result.ok) return setState({ status: "error", error: result.error });
      if (!result.changed) return setState({ status: "error", error: "The match could not be read." });
      const MatchClient = Client({
        // The game the server runs: a seat presses only its own combat steps.
        game: withSeatedCombat(Caribbean),
        board: CaribbeanBoard,
        numPlayers: result.state.ctx.numPlayers,
        multiplayer: apiTransport(api, result.state, onError),
        debug: false,
      }) as ComponentType<{ playerID: string; matchID: string }>;
      setState({ status: "ready", MatchClient, seat: result.seat, matchId });
    });
    return () => {
      live = false;
    };
  }, [api, matchId, onError]);
  return state;
}
