import { useEffect, useState } from "react";
import { roomPath } from "./onlineRoute";
import type { RoomApi } from "./roomApi";

/** `?view=join&invite=…`: takes a free seat in the invite's room, then opens its lobby. */
export function JoinRoom({ api, inviteCode }: { api: RoomApi; inviteCode: string | null }) {
  const [error, setError] = useState<string | undefined>(inviteCode ? undefined : "That invite link is not complete.");
  useEffect(() => {
    if (!inviteCode) return;
    let live = true;
    void api.joinRoom(inviteCode).then((result) => {
      if (!live) return;
      if (result.ok) window.location.replace(roomPath(result.room.id));
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [api, inviteCode]);
  return error ? (
    <p role="alert" className="text-shell-ink-wax">
      {error}
    </p>
  ) : (
    <p role="status">Taking your seat…</p>
  );
}
