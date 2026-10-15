import { useState } from "react";
import type { RoomApi, RoomView } from "./roomApi";
import { seatRole, turnTimerLabel } from "./roomLabels";
import { BTN_BRASS, BTN_INK, INPUT, LABEL } from "./shellStyles";
import { useRoom } from "./useRoom";

const MAP_LABELS: Record<RoomView["mapSize"], string> = { small: "Small", medium: "Medium", large: "Large" };

/** `?view=room&id=…`: the room's captains, its invite link, and the host's Start. */
export function RoomLobby({ api, id }: { api: RoomApi; id: string | null }) {
  const [state, replace] = useRoom(api, id);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  if (state.status === "loading") return <p role="status">Reading the ship's log…</p>;
  if (state.status === "error") {
    return (
      <p role="alert" className="text-shell-ink-wax">
        {state.error}
      </p>
    );
  }
  const { room } = state;
  const inviteUrl = new URL(room.invitePath, window.location.origin).toString();
  const full = room.seats.length >= room.seatCount;

  async function start() {
    setStarting(true);
    setError(undefined);
    const result = await api.startRoom(room.id);
    setStarting(false);
    if (result.ok) replace(result.room);
    else setError(result.error);
  }

  return (
    <>
      <p className="text-shell-ink-soft">
        {MAP_LABELS[room.mapSize]} waters, {turnTimerLabel(room.turnTimerSeconds)}, a private casual match.
      </p>
      <ol className="space-y-1" aria-label="Captains">
        {Array.from({ length: room.seatCount }, (_, index) => {
          const seat = room.seats.find((s) => s.index === index);
          return (
            <li key={index} className="flex justify-between border-b border-shell-ink-soft/25 pb-1">
              <span>{seat ? (seat.displayName ?? "A captain") : <em className="text-shell-ink-soft">An empty berth</em>}</span>
              <span className="text-[14px] text-shell-ink-soft">{seatRole(index, room)}</span>
            </li>
          );
        })}
      </ol>

      {room.status === "open" && (
        <div>
          <label htmlFor="invite-link" className={LABEL}>
            Invite link: whoever opens it while signed in takes a free seat
          </label>
          <div className="flex gap-2">
            <input id="invite-link" readOnly value={inviteUrl} onFocus={(e) => e.target.select()} className={INPUT} />
            <button
              type="button"
              className={`${BTN_INK} shrink-0`}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {room.status === "open" && room.isHost && (
        <button type="button" disabled={!full || starting} onClick={start} className={BTN_BRASS}>
          {starting ? "Raising the anchor…" : full ? "Start match" : "Waiting for captains…"}
        </button>
      )}
      {room.status === "open" && !room.isHost && room.hostSeat !== null && <p role="status">Waiting for the host to start the match…</p>}
      {room.status === "open" && room.hostSeat === null && (
        <p role="status">This room's host has left, so its match cannot be started. Open a new room.</p>
      )}
      {room.status === "starting" && <p role="status">The host is starting the match…</p>}
      {(room.status === "started" || room.status === "finished") && <p role="status">The match has set sail.</p>}
      {error && (
        <p role="alert" className="text-shell-ink-wax">
          {error}
        </p>
      )}
    </>
  );
}
