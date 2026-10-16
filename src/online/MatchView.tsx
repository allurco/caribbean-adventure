import { useCallback, useEffect, useMemo, useState } from "react";
import { MapLoadingScreen } from "../board/MapLoadingScreen";
import type { AccountClient } from "./accountClient";
import { LeaveToHarbour } from "./LeaveToHarbour";
import { createMatchApi } from "./matchApi";
import { OnlineSheet } from "./OnlineSheet";
import { useApiDeps } from "./useRoomApi";
import { useMatchLive, useMatchPresence } from "./useMatchLive";
import { useOnlineMatch } from "./useOnlineMatch";

/** How long a refused order's reason stays on screen. */
const NOTICE_MS = 5000;

/** `?view=match&id=…`: the signed-in player's own seat of an online match (#113). */
export function MatchView({ client, matchId }: { client: AccountClient; matchId: string | null }) {
  const deps = useApiDeps(client);
  const api = useMemo(() => createMatchApi(deps), [deps]);
  const [notice, setNotice] = useState<string>();
  const onError = useCallback((message: string) => setNotice(message), []);
  // The match's realtime channel (#114): signals when to read, and who is online.
  const live = useMatchLive(client, matchId);
  const match = useOnlineMatch(api, matchId, onError, live);
  const onlineSeats = useMatchPresence(live, match.status === "ready" ? match.seat : null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (match.status === "loading") return <MapLoadingScreen />;
  if (match.status === "error") {
    return (
      <OnlineSheet title="The match">
        <p role="alert" className="text-shell-ink-wax">
          {match.error}
        </p>
      </OnlineSheet>
    );
  }
  const { MatchClient, seat, matchId: id } = match;
  return (
    <>
      <MatchClient playerID={seat} matchID={id} onlineSeats={onlineSeats} />
      <LeaveToHarbour />
      {notice && (
        <p
          role="alert"
          className="fixed left-1/2 top-16 z-[70] -translate-x-1/2 rounded bg-shell-tar/90 px-4 py-2 font-garamond text-[16px] text-shell-parchment shadow-lg"
        >
          {notice}
        </p>
      )}
    </>
  );
}
