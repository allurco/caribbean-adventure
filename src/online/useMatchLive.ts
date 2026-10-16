import { useEffect, useMemo, useState } from "react";
import type { AccountClient } from "./accountClient";
import { createMatchLive, type MatchLive } from "./matchLive";

/**
 * The live link to a match's realtime channel (#114), for the board's
 * transport to listen to; null without a channel to open (a fake client),
 * and the board then polls. `useMatchPresence` joins it.
 */
export function useMatchLive(client: AccountClient, matchId: string | null): MatchLive | null {
  const open = client.openMatchChannel;
  return useMemo(() => (open && matchId ? createMatchLive({ open: async () => open, matchId }) : null), [open, matchId]);
}

/**
 * Joins the channel as `seat` once it is known, and leaves it when the
 * board unmounts (closing the channel); the seats online meanwhile, or null
 * while unknown.
 */
export function useMatchPresence(live: MatchLive | null, seat: string | null): readonly string[] | null {
  const [onlineSeats, setOnlineSeats] = useState<readonly string[] | null>(null);
  useEffect(() => {
    if (!live || seat === null) return;
    const unsubscribe = live.subscribe({ onSignal: () => {}, onLive: () => {}, onOnline: setOnlineSeats });
    live.start(seat);
    return () => {
      unsubscribe();
      live.stop();
      setOnlineSeats(null);
    };
  }, [live, seat]);
  return onlineSeats;
}
