import { useCallback, useEffect, useState } from "react";
import type { RoomApi, RoomView } from "./roomApi";

/** How often an open room's lobby asks for news (seats filling, the start). Realtime replaces this later (#114). */
export const ROOM_POLL_MS = 5000;

export type RoomState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; room: RoomView };

/** The room, refetched every `ROOM_POLL_MS` while it waits for captains or its start; `replace` sets it from a response. */
export function useRoom(api: RoomApi, id: string | null): [RoomState, (room: RoomView) => void] {
  const [state, setState] = useState<RoomState>(id ? { status: "loading" } : { status: "error", error: "That room link is not complete." });
  const open = state.status === "ready" && (state.room.status === "open" || state.room.status === "starting");
  const loading = state.status === "loading";

  useEffect(() => {
    if (!id || (!open && !loading)) return;
    let live = true;
    const load = async () => {
      const result = await api.getRoom(id);
      if (!live) return;
      setState(result.ok ? { status: "ready", room: result.room } : { status: "error", error: result.error });
    };
    if (loading) void load();
    const timer = window.setInterval(() => void load(), ROOM_POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [api, id, open, loading]);

  const replace = useCallback((room: RoomView) => setState({ status: "ready", room }), []);
  return [state, replace];
}
