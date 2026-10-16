import { useEffect, useMemo } from "react";
import type { AccountClient } from "./accountClient";
import { createMatchLive, type MatchLive } from "./matchLive";

/**
 * The live link to a match's realtime channel (#114), for the board's
 * transport to listen to: joined while the match view is mounted, left when
 * it unmounts (closing the channel). Null without a channel to open (a fake
 * client), and the board then polls.
 */
export function useMatchLive(client: AccountClient, matchId: string | null): MatchLive | null {
  const open = client.openMatchChannel;
  const live = useMemo(() => (open && matchId ? createMatchLive({ open: async () => open, matchId }) : null), [open, matchId]);
  useEffect(() => {
    if (!live) return;
    live.start();
    return () => live.stop();
  }, [live]);
  return live;
}
