import { useEffect, useState, type ComponentType } from "react";
import { Client } from "boardgame.io/react";
import { CaribbeanBoard } from "../board/Board";
import { Caribbean } from "../game/Game";
import { withSeatedCombat } from "../game/seatedCombat";
import { apiTransport } from "./apiTransport";
import type { MatchLive } from "./matchLive";
import type { MatchSyncApi } from "./matchSync";

/** The match client's props: the seat, and which seats the server saw lately (#114) for the board. */
export interface MatchClientProps {
  playerID: string;
  matchID: string;
  onlineSeats?: readonly string[] | null;
}

export type OnlineMatchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; MatchClient: ComponentType<MatchClientProps>; seat: string; matchId: string };

/**
 * The seat's board for an online match (#113): reads the seat's view once,
 * then mounts boardgame.io's client on it with the `/api` transport. The
 * game's rules run on the server; the client never sees more than its seat's
 * view. `onError` hears why an order was refused. `live`, the match's
 * realtime channel (#114), tells the board when to read again; without it
 * the board polls. `onOnline` hears which seats the server saw lately, from
 * the first read and every answer after it.
 */
export function useOnlineMatch(
  api: MatchSyncApi,
  matchId: string | null,
  onError: (message: string) => void,
  live: MatchLive | null = null,
  onOnline?: (seats: readonly string[]) => void,
): OnlineMatchState {
  const [state, setState] = useState<OnlineMatchState>(
    matchId ? { status: "loading" } : { status: "error", error: "That match link is not complete." },
  );
  useEffect(() => {
    if (!matchId) return;
    let mounted = true;
    void api.getMatch(matchId).then((result) => {
      if (!mounted) return;
      if (!result.ok) return setState({ status: "error", error: result.error });
      if (!result.changed) return setState({ status: "error", error: "The match could not be read." });
      if (result.online) onOnline?.(result.online);
      const MatchClient = Client({
        // The game the server runs: a seat presses only its own combat steps.
        game: withSeatedCombat(Caribbean),
        board: CaribbeanBoard,
        numPlayers: result.state.ctx.numPlayers,
        multiplayer: apiTransport({ api, initial: result.state, onError, live, onOnline }),
        debug: false,
      }) as ComponentType<MatchClientProps>;
      setState({ status: "ready", MatchClient, seat: result.seat, matchId });
    });
    return () => {
      mounted = false;
    };
  }, [api, matchId, onError, live, onOnline]);
  return state;
}
