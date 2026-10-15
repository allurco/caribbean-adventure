import { useState, type FormEvent } from "react";
import type { MapSizeId } from "../game/mapConfig";
import { roomPath } from "./onlineRoute";
import type { RoomApi } from "./roomApi";
import { BTN_BRASS, INPUT, LABEL } from "./shellStyles";

const TURN_TIMERS: { seconds: number; label: string }[] = [
  { seconds: 24 * 60 * 60, label: "A day a turn (play at your leisure)" },
  { seconds: 2 * 60, label: "Two minutes a turn (play together now)" },
];

/** `?view=rooms`: the settings of a new private room; on success, its lobby. */
export function NewRoomForm({ api }: { api: RoomApi }) {
  const [seats, setSeats] = useState(2);
  const [mapSize, setMapSize] = useState<MapSizeId>("small");
  const [turnTimerSeconds, setTurnTimerSeconds] = useState(TURN_TIMERS[0].seconds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const result = await api.createRoom({ seats, mapSize, turnTimerSeconds });
    if (result.ok) {
      window.location.assign(roomPath(result.room.id));
    } else {
      setBusy(false);
      setError(result.error);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="room-seats" className={LABEL}>
          Captains
        </label>
        <select id="room-seats" value={seats} onChange={(e) => setSeats(Number(e.target.value))} className={INPUT}>
          {[2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n} captains
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="room-map" className={LABEL}>
          Waters
        </label>
        <select id="room-map" value={mapSize} onChange={(e) => setMapSize(e.target.value as MapSizeId)} className={INPUT}>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>
      <div>
        <label htmlFor="room-timer" className={LABEL}>
          Turn timer
        </label>
        <select id="room-timer" value={turnTimerSeconds} onChange={(e) => setTurnTimerSeconds(Number(e.target.value))} className={INPUT}>
          {TURN_TIMERS.map((t) => (
            <option key={t.seconds} value={t.seconds}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={busy} className={BTN_BRASS}>
        {busy ? "Opening the room…" : "Open a private room"}
      </button>
      {error && (
        <p role="alert" className="text-shell-ink-wax">
          {error}
        </p>
      )}
    </form>
  );
}
