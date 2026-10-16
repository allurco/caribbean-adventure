/**
 * Which seats of a match are online (#114), kept on the server: every
 * authenticated read or move of a match records when its seat was last seen
 * (`seats.last_seen_at`), and a seat seen within the last minute is online.
 * No client sends anything for it, so none can fake another seat's dot or
 * spend the project's realtime quota on it. Only which seats are online
 * leaves the server, never the times or anything else about a player.
 */
import type { MatchSeat } from "./onlineStore";

/** A seat's last-seen time is written again only once it is this old, so polling does not write on every read. */
export const SEEN_REFRESH_SECONDS = 20;

/** A seat seen within this long is online: past the live fallback poll (30 s) and the refresh above. */
export const ONLINE_WINDOW_SECONDS = 60;

const ageMs = (lastSeenAt: string | null, now: number) => (lastSeenAt === null ? Infinity : now - Date.parse(lastSeenAt));

/** Whether the seat's last-seen time is old enough (or missing) to write again. */
export function seenNeedsRefresh(lastSeenAt: string | null, now: number): boolean {
  return !(ageMs(lastSeenAt, now) < SEEN_REFRESH_SECONDS * 1000);
}

/** The seats seen within the window, as boardgame.io playerIDs in seat order; `caller` is online, being seen now. */
export function seatsOnline(seats: readonly MatchSeat[], caller: number, now: number): string[] {
  return seats
    .filter((s) => s.index === caller || ageMs(s.lastSeenAt, now) <= ONLINE_WINDOW_SECONDS * 1000)
    .map((s) => s.index)
    .sort((a, b) => a - b)
    .map(String);
}
