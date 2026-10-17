/**
 * What the HUD shows of the event deck (#246): the card drawn as a turn
 * ends (`EventCard`) and the short event log (`HudEventLog`). Reads only the
 * log in G, which carries public facts alone. Pure.
 */
import type { EventCardKind, EventLogEntry, PortNation, Region } from "../game/types";
import type { EventArtKind } from "./cardArtSlots";
import type { ShellLayout } from "../online/shellLayout";
import { controlsLocked, type Handoff } from "./turnHandoff";

/** A card's face: its name, the region it happens in (none for Calm seas) and its effect in one line. */
export interface EventCardFace {
  id: number;
  title: string;
  region: string | null;
  effect: string;
  /** Its art's slot (cardArtSlots.ts, #247). */
  art: EventArtKind;
  /** The nation whose flag its art flies (Flotilla patrol, Lost flag), else null. */
  nation: PortNation | null;
  /** In the log: the captain whose turn it came on, when the board names them. */
  after?: string | null;
}

const TITLES: Readonly<Record<EventCardKind, string>> = {
  calmSeas: "Calm seas",
  merchantConvoy: "Merchant convoy",
};

/** The face of the event `entry`, its region named from the map's `regions`. */
export function eventCardView(entry: EventLogEntry, regions: readonly Region[] | undefined): EventCardFace {
  return { ...eventCardText(entry, regions), id: entry.id, art: entry.kind, nation: null };
}

/** The words on `entry`'s card: its name, region and effect. */
function eventCardText(entry: EventLogEntry, regions: readonly Region[] | undefined): Pick<EventCardFace, "title" | "region" | "effect"> {
  const title = TITLES[entry.kind];
  switch (entry.kind) {
    case "calmSeas":
      return { title, region: null, effect: "The sea lies quiet." };
    case "merchantConvoy": {
      const sail = entry.merchants === 1 ? "A merchant sails" : `${entry.merchants} merchants sail`;
      return {
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

/**
 * The log's last `count` events, newest first, as card faces, each naming
 * the captain whose turn it came on (`nameOf` the seat; none without it).
 */
export function eventLogRows(
  log: readonly EventLogEntry[] | undefined,
  regions: readonly Region[] | undefined,
  count: number,
  nameOf?: (seat: string) => string
): EventCardFace[] {
  if (count <= 0) return [];
  return (log ?? [])
    .slice(-count)
    .reverse()
    .map((entry) => ({ ...eventCardView(entry, regions), after: nameOf ? nameOf(entry.seat) : null }));
}

/**
 * How many events the HUD's log lists: four on a desktop; none on a phone
 * held sideways, where the captain and ship card fills the screen's foot
 * just under the glory board (with four seats, the log sat behind it). The
 * card still shows there.
 */
export function eventLogLength(layout: ShellLayout): number {
  return layout === "compact" ? 0 : 4;
}

/**
 * Whether the drawn card may show: once the turn's hand-off has come to
 * rest (`controlsLocked`: it rests at "idle", never back to null) and the
 * turn change is over, so it never covers either; not once the game is over.
 * Nor while a new captain's turn is pending (`captainTurnPending`, from
 * `captainTurnToOpen` in captainPickTurn.ts, #372): the seat whose ship is
 * gone is choosing, or has picked and its turn is still to open. The
 * hand-off to such a seat rests on the captain screen, and the card waits
 * for the pick and the new captain's banner, then shows in full.
 */
export function eventCardShows({
  handoff,
  turnChangeShowing,
  gameOver,
  captainTurnPending,
}: {
  handoff: Handoff | null;
  turnChangeShowing: boolean;
  gameOver: boolean;
  captainTurnPending: boolean;
}): boolean {
  return !controlsLocked(handoff) && !turnChangeShowing && !gameOver && !captainTurnPending;
}
