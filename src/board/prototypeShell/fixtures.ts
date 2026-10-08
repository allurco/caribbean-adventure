/**
 * THROWAWAY PROTOTYPE (#104 online shell). Stub data only: in memory, no
 * network, no persistence. Every variant reads the same fixtures so the
 * comparison is about structure, not content.
 */

export type Presence = "online" | "in-match" | "away" | "offline";
export type Provider = "Discord" | "Google" | "Email";

export interface Player {
  id: string;
  name: string;
  /** Two letters drawn on the avatar seal. */
  initials: string;
  /** Seal colour (Tailwind arbitrary value friendly hex). */
  seal: string;
  rating: number;
  presence: Presence;
}

export interface AsyncMatch {
  id: string;
  name: string;
  round: number;
  players: number;
  yourTurn: boolean;
  /** Whose turn it is when it is not ours. */
  waitingOn?: string;
  /** Hours left on the current turn's timer. */
  hoursLeft: number;
  glory: number;
  ranked: boolean;
  mapSize: "Small" | "Medium" | "Large";
}

export interface PublicRoom {
  id: string;
  name: string;
  host: string;
  hostRating: number;
  mapSize: "Small" | "Medium" | "Large";
  seats: number;
  filled: number;
  timer: "24 h async" | "2 min live";
  ranked: boolean;
}

export type SeatState =
  | { kind: "filled"; player: Player; host?: boolean; party?: boolean; ready: boolean }
  | { kind: "empty" };

export interface ChatLine {
  from: string;
  text: string;
  at: string;
}

export const ME: Player = {
  id: "me",
  name: "Isabel de Varela",
  initials: "IV",
  seal: "#7c2d12",
  rating: 1487,
  presence: "online",
};

export const ME_PROVIDER: Provider = "Discord";
export const ME_RANK_TITLE = "Corsair";
export const ME_RECORD = { played: 23, wins: 6 };

const TOMAS: Player = { id: "p2", name: "Tomás Garrido", initials: "TG", seal: "#1e3a5f", rating: 1412, presence: "online" };
const ANA: Player = { id: "p3", name: "Ana Ferreira", initials: "AF", seal: "#365314", rating: 1530, presence: "in-match" };
const HENRIQUE: Player = { id: "p4", name: "Henrique Lobo", initials: "HL", seal: "#4c1d95", rating: 1366, presence: "online" };
const MARGOT: Player = { id: "p5", name: "Margot Kessel", initials: "MK", seal: "#713f12", rating: 1601, presence: "away" };
const PIETER: Player = { id: "p6", name: "Pieter van Hoorn", initials: "PH", seal: "#134e4a", rating: 1455, presence: "offline" };

export const MATCHES: readonly AsyncMatch[] = [
  { id: "m1", name: "The Windward Passage", round: 14, players: 5, yourTurn: true, hoursLeft: 6, glory: 7, ranked: true, mapSize: "Medium" },
  { id: "m2", name: "Tortuga Run", round: 7, players: 4, yourTurn: false, waitingOn: "Henrique Lobo", hoursLeft: 18, glory: 3, ranked: false, mapSize: "Small" },
  { id: "m3", name: "Gulf of Paria", round: 3, players: 6, yourTurn: false, waitingOn: "Margot Kessel", hoursLeft: 21, glory: 1, ranked: true, mapSize: "Large" },
];

export const PUBLIC_ROOMS: readonly PublicRoom[] = [
  { id: "r1", name: "Spanish Main, no mercy", host: "Margot Kessel", hostRating: 1601, mapSize: "Large", seats: 6, filled: 4, timer: "24 h async", ranked: false },
  { id: "r2", name: "Quick live raid", host: "Diogo Sá", hostRating: 1320, mapSize: "Small", seats: 4, filled: 3, timer: "2 min live", ranked: false },
  { id: "r3", name: "Merchants welcome", host: "Lise Brandt", hostRating: 1188, mapSize: "Medium", seats: 5, filled: 2, timer: "24 h async", ranked: false },
  { id: "r4", name: "Weekend armada", host: "Pieter van Hoorn", hostRating: 1455, mapSize: "Medium", seats: 6, filled: 5, timer: "24 h async", ranked: false },
  { id: "r5", name: "Duel at Cartagena", host: "Raúl Montoya", hostRating: 1544, mapSize: "Small", seats: 2, filled: 1, timer: "2 min live", ranked: false },
];

export const PARTY = {
  leaderId: ME.id,
  members: [ME, TOMAS, ANA] as readonly Player[],
};

export const FRIENDS: readonly Player[] = [HENRIQUE, MARGOT, PIETER];

export const PARTY_CHAT: readonly ChatLine[] = [
  { from: "Tomás Garrido", text: "Ranked tonight? I'm two glory off Corsair.", at: "20:41" },
  { from: "Ana Ferreira", text: "Finishing my turn in Tortuga, five minutes.", at: "20:43" },
  { from: "Isabel de Varela", text: "Queue when you're back. Medium map if it's a room.", at: "20:44" },
];

export const ROOM = {
  name: "Isabel's charter",
  inviteLink: "https://caribbean.example/r/7KQ-MARE",
  seats: [
    { kind: "filled", player: ME, host: true, party: true, ready: true },
    { kind: "filled", player: TOMAS, party: true, ready: true },
    { kind: "filled", player: ANA, party: true, ready: false },
    { kind: "filled", player: HENRIQUE, ready: true },
    { kind: "empty" },
    { kind: "empty" },
  ] as SeatState[],
  settings: {
    seats: 6,
    mapSize: "Medium" as "Small" | "Medium" | "Large",
    seed: 418213,
    timer: "24 h async" as "24 h async" | "2 min live",
    ranked: false,
    visibility: "Private" as "Private" | "Public",
  },
};

export const QUEUE = {
  /** Seconds searched so far when the screen opens. */
  elapsed: 100,
  target: 6,
  minimum: 4,
  /** After this many seconds the queue starts with `minimum`. */
  relaxAfter: 180,
  found: [ME, TOMAS, ANA, { ...PIETER, presence: "online" as Presence }] as readonly Player[],
};

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const PRESENCE_LABEL: Record<Presence, string> = {
  online: "Ashore",
  "in-match": "At sea",
  away: "Away",
  offline: "Offline",
};
