/**
 * Which seats of a match are online (#114), kept on the server: every
 * authenticated read or move of a match records when its seat was last seen
 * (`seats.last_seen_at`), and a seat seen within the last minute is online.
 * No client sends anything for it, so none can fake another seat's dot or
 * spend the project's realtime quota on it. Only which seats are online
 * leaves the server, never the times or anything else about a player.
 */
import type { SeatSeen } from "./onlineStore";

/** A seat's last-seen time is written again only once it is this old, so polling does not write on every read. */
export const SEEN_REFRESH_SECONDS = 20;

/** A seat seen within this long is online: past the live fallback poll (30 s) and the refresh above. */
export const ONLINE_WINDOW_SECONDS = 60;

const ageMs = (lastSeenAt: string | null, now: number) => (lastSeenAt === null ? Infinity : now - Date.parse(lastSeenAt));

/** Whether the seat's last-seen time is old enough (or missing) to write again. */
export function seenNeedsRefresh(lastSeenAt: string | null, now: number): boolean {
  return !(ageMs(lastSeenAt, now) < SEEN_REFRESH_SECONDS * 1000);
}

/** The write's own throttle (`markSeatSeen`): a time seen before this is stale. */
export function staleBefore(now: number): string {
  return new Date(now - SEEN_REFRESH_SECONDS * 1000).toISOString();
}

/** The seats seen within the window, as boardgame.io playerIDs in seat order; `caller` is online, being seen now. */
export function seatsOnline(seats: readonly SeatSeen[], caller: number, now: number): string[] {
  const others = seats.filter((s) => s.index !== caller);
  return [{ index: caller, lastSeenAt: null }, ...others]
    .filter((s) => s.index === caller || ageMs(s.lastSeenAt, now) <= ONLINE_WINDOW_SECONDS * 1000)
    .map((s) => s.index)
    .sort((a, b) => a - b)
    .map(String);
}

/** Logged once per instance while the database lacks the column (its migration not yet pushed). */
export const MISSING_LAST_SEEN_COLUMN = "seats.last_seen_at missing: push migration 20261022000000";

/** Postgres's undefined_column. */
const UNDEFINED_COLUMN = "42703";

const isMissingColumn = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === UNDEFINED_COLUMN;

/**
 * Logs a failure to read or write when a seat was last seen; neither fails
 * the request, as the online dot is only a hint. A missing column is named,
 * with the migration to push, once per reporter (one per instance in
 * `matches.ts`) rather than on every read; any other failure is logged as
 * the error it is, each time.
 */
export function seenFailureReporter(log: (...args: unknown[]) => void): (what: string, error: unknown) => void {
  let missingColumnReported = false;
  return (what, error) => {
    if (!isMissingColumn(error)) return log(what, error);
    if (missingColumnReported) return;
    missingColumnReported = true;
    log(MISSING_LAST_SEEN_COLUMN);
  };
}
