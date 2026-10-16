/**
 * The event deck (#240, #246): at the end of every main-phase turn one card
 * is drawn from a shuffled deck and the world answers. Cards are plain data;
 * the deck lives in `G.eventDeck`. Pure: randomness comes in as `rng`,
 * boardgame.io's `random.Number`, so the match's seed draws the same cards on
 * every client.
 *
 * A card that cannot apply (a convoy with no port to sail from) becomes Calm
 * seas, and is logged as one.
 */

import { hexEquals } from "./hex";
import { merchantSpawnPorts, spawnMerchantFrom } from "./npcManager";
import type { CaribbeanState, EventCardKind, EventDeckState, EventEffect, EventLogEntry, MapCell } from "./types";

export type { EventCardKind, EventDeckState, EventEffect, EventLogEntry } from "./types";

/** How many events the public log keeps, the newest last. */
export const EVENT_LOG_LENGTH = 8;

/**
 * How many cards of each kind the deck holds: the one place the mix is set.
 * #240's full mix is 12 Calm seas, 7 Merchant convoy, 7 Storm, 6 Flotilla
 * patrol, 3 NPC pirate, 3 Clemency and 2 Lost flag. Until a card's slice
 * lands its count sits as Calm seas, so the deck still holds 40 cards:
 * 12 + 7 + 6 + 3 + 3 + 2 = 33 Calm seas for now.
 */
export const EVENT_DECK_MIX: Readonly<Record<EventCardKind, number>> = {
  calmSeas: 12 + 7 + 6 + 3 + 3 + 2,
  merchantConvoy: 7,
};

/** The deck's size: every card of the mix. */
export const EVENT_DECK_SIZE = Object.values(EVENT_DECK_MIX).reduce((sum, count) => sum + count, 0);

/** The deck in the mix's order, unshuffled. */
export function buildEventDeck(): EventCardKind[] {
  return (Object.entries(EVENT_DECK_MIX) as [EventCardKind, number][]).flatMap(([kind, count]) =>
    Array.from({ length: count }, () => kind)
  );
}

/** A whole deck, shuffled with `rng` (Fisher–Yates). */
export function shuffleEventDeck(rng: () => number): EventCardKind[] {
  const deck = buildEventDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** A match's deck as `setup()` deals it: a whole deck shuffled with `rng`, nothing drawn yet. */
export function newEventDeck(rng: () => number): EventDeckState {
  return { drawPile: shuffleEventDeck(rng), log: [], drawn: 0 };
}

/** When a card is drawn: the seat whose turn ended, and the turn (`ctx.turn`). */
export interface DrawnAt {
  seat: string;
  turn: number;
}

/**
 * Draw the top card, apply it to `G` and log it: the end of a main-phase
 * turn's draw. An empty pile, or a match stored before the deck, is first
 * reshuffled from a whole deck. Returns the event as logged.
 */
export function drawEvent(G: CaribbeanState, rng: () => number, { seat, turn }: DrawnAt): EventLogEntry {
  const deck = (G.eventDeck ??= { drawPile: [], log: [], drawn: 0 });
  if (deck.drawPile.length === 0) deck.drawPile = shuffleEventDeck(rng);
  const card = deck.drawPile.pop()!;
  deck.drawn++;
  const entry: EventLogEntry = { id: deck.drawn, seat, turn, ...(applyEventCard(G, card, rng) ?? { kind: "calmSeas" }) };
  deck.log = [...deck.log, entry].slice(-EVENT_LOG_LENGTH);
  return entry;
}

/** What `card` did, for the log, or null when it could not apply (the draw then logs Calm seas). */
function applyEventCard(G: CaribbeanState, card: EventCardKind, rng: () => number): EventEffect | null {
  switch (card) {
    case "calmSeas":
      return { kind: "calmSeas" };
    case "merchantConvoy":
      return applyMerchantConvoy(G, rng);
  }
}

/**
 * Merchant convoy: one or two merchants put to sea from a random trading
 * port, each bound for another port, which may lie in another region, so
 * trade crosses the sea. Null when not one could sail.
 */
export function applyMerchantConvoy(G: CaribbeanState, rng: () => number): EventEffect | null {
  const ports = merchantSpawnPorts(G);
  if (ports.length === 0) return null;
  const port = ports[Math.floor(rng() * ports.length)];
  const count = rng() < 0.5 ? 1 : 2;
  const bound: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = spawnMerchantFrom(G, port, rng);
    if (id) bound.push(portNameAt(G.cells, G.npcs[id].destinationPortHex));
  }
  if (bound.length === 0) return null;
  return { kind: "merchantConvoy", region: port.region ?? null, port: port.portName ?? "a port", merchants: bound.length, bound };
}

function portNameAt(cells: readonly MapCell[], at: MapCell["hex"]): string {
  return cells.find((c) => hexEquals(c.hex, at))?.portName ?? "a port";
}
