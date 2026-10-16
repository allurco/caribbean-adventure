/**
 * What the HUD shows of the event deck (#246): the card drawn as a turn
 * ends (`EventCard`) and the short event log (`HudEventLog`). Reads only the
 * log in G, which carries public facts alone. Pure.
 */
import type { EventCardKind, EventLogEntry, Region } from "../game/types";

/** A card's face: its name, the region it happens in (none for Calm seas) and its effect in one line. */
export interface EventCardFace {
  id: number;
  title: string;
  region: string | null;
  effect: string;
}

const TITLES: Readonly<Record<EventCardKind, string>> = {
  calmSeas: "Calm seas",
  merchantConvoy: "Merchant convoy",
};

/** The face of the event `entry`, its region named from the map's `regions`. */
export function eventCardView(entry: EventLogEntry, regions: readonly Region[] | undefined): EventCardFace {
  const title = TITLES[entry.kind];
  switch (entry.kind) {
    case "calmSeas":
      return { id: entry.id, title, region: null, effect: "The sea lies quiet." };
    case "merchantConvoy": {
      const sail = entry.merchants === 1 ? "A merchant sails" : `${entry.merchants} merchants sail`;
      return {
        id: entry.id,
        title,
        region: (entry.region !== null && regions?.[entry.region]?.name) || null,
        effect: `${sail} from ${entry.port}, bound for ${listed([...new Set(entry.bound)])}.`,
      };
    }
  }
}

function listed(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "another port") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The id of the last event in `log`, or 0 when none was drawn: what the board has already seen as it loads. */
export function lastEventId(log: readonly EventLogEntry[] | undefined): number {
  return log?.at(-1)?.id ?? 0;
}

/**
 * The card to show now: the newest event drawn since the board last looked
 * (after `seenId`) that is not Calm seas, which passes with no card. Null
 * when there is none.
 */
export function freshEventCard(seenId: number, log: readonly EventLogEntry[] | undefined): EventLogEntry | null {
  return [...(log ?? [])].reverse().find((entry) => entry.id > seenId && entry.kind !== "calmSeas") ?? null;
}

/** The log's last `count` events, newest first, as card faces. */
export function eventLogRows(
  log: readonly EventLogEntry[] | undefined,
  regions: readonly Region[] | undefined,
  count: number
): EventCardFace[] {
  return (log ?? []).slice(-count).reverse().map((entry) => eventCardView(entry, regions));
}
