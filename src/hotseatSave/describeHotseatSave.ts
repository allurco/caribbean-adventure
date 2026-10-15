import { getMapPreset } from "../game/mapConfig";
import type { HotseatSave } from "./hotseatSave";

/** What the start screen says about a saved voyage. */
export interface HotseatSaveSummary {
  /** "Turn 12", or "Drafting captains". */
  turn: string;
  /** "Solo", or "3 captains". */
  seats: string;
  /** The seats' captains' names, in seat order; none while drafting. */
  captains: string[];
  /** "Large map". */
  map: string;
  /** "Saved 5 minutes ago". */
  saved: string;
}

/** The summary of `save` at `now` (ms since the epoch). */
export function describeHotseatSave(save: HotseatSave, now: number): HotseatSaveSummary {
  const { G, ctx } = save.state;
  const seatIds = Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
  return {
    turn: ctx.phase === "draft" ? "Drafting captains" : `Turn ${ctx.turn}`,
    seats: ctx.numPlayers === 1 ? "Solo" : `${ctx.numPlayers} captains`,
    captains: seatIds.flatMap((id) => {
      const name = G.ships[id]?.captain?.name ?? G.lostShips?.[id]?.captain?.name;
      return name ? [name] : [];
    }),
    map: `${getMapPreset(save.map.mapSize).label} map`,
    saved: savedAgo(save.savedAt, now),
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long before `now` `savedAt` was, in the largest unit that fits. */
export function savedAgo(savedAt: number, now: number): string {
  const ago = Math.max(0, now - savedAt);
  if (ago < MINUTE) return "Saved just now";
  if (ago < HOUR) return `Saved ${count(Math.floor(ago / MINUTE), "minute")} ago`;
  if (ago < DAY) return `Saved ${count(Math.floor(ago / HOUR), "hour")} ago`;
  if (ago < 2 * DAY) return "Saved yesterday";
  return `Saved ${count(Math.floor(ago / DAY), "day")} ago`;
}

function count(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}
