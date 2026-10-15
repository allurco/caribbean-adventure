/**
 * PROTOTYPE (throwaway, branch proto/combat-ui): fake state for the combat UI
 * prototype of PRD #259. No engine: one scripted fight, round 2 of a Frigate
 * against a Flute, frozen at each beat the variants draw.
 *
 * The story: Henry Morgan's Frigate attacked François l'Olonnais' Flute. Round 1
 * was Broadside against Broadside, so a smoke bank lies between them. In round
 * 2 Morgan (who holds the weather gauge) orders Broadside, fire high; l'Olonnais
 * orders Bear away. Broadside beats Bear away: Morgan rakes her stern (3 hits:
 * mast, crew, hull), then she tries to flee into the smoke and is caught.
 */
import type { Nation, ShipClass } from "../../game/types";

export type Order = "broadside" | "closeIn" | "bearAway";
export type Aim = "high" | "low";
export type Place = "Mast" | "Crew" | "Cannons" | "Hull" | "Cargo";
export type Step = 1 | 2 | 3 | 4 | 5;
export type Seat = "waiting" | "bystander";

export const STEPS: { step: Step; name: string }[] = [
  { step: 1, name: "Declaration" },
  { step: 2, name: "Secret orders" },
  { step: 3, name: "Reveal" },
  { step: 4, name: "Resolution" },
  { step: 5, name: "Other seats" },
];

export interface Gauge {
  current: number;
  max: number;
}

export interface ProtoShip {
  seat: string;
  captain: string;
  nation: Nation;
  shipClass: ShipClass;
  shipName: string;
  color: string;
  hull: Gauge;
  crew: Gauge;
  cannons: Gauge;
  /** Moves a turn: the class's manoeuvrability less mast damage, at least 1. */
  moves: Gauge;
  cargo: string[];
  holdsGauge: boolean;
}

/** Before round 2's damage (round 1 cost each ship one hull). */
export const ATTACKER: ProtoShip = {
  seat: "P1",
  captain: "Henry Morgan",
  nation: "England",
  shipClass: "Frigate",
  shipName: "Resolute",
  color: "#c0392b",
  hull: { current: 4, max: 5 },
  crew: { current: 4, max: 4 },
  cannons: { current: 4, max: 4 },
  moves: { current: 3, max: 3 },
  cargo: ["Rum"],
  holdsGauge: true,
};

export const DEFENDER: ProtoShip = {
  seat: "P2",
  captain: "François l'Olonnais",
  nation: "France",
  shipClass: "Flute",
  shipName: "Belle Marie",
  color: "#2e6db4",
  hull: { current: 3, max: 4 },
  crew: { current: 3, max: 3 },
  cannons: { current: 2, max: 2 },
  moves: { current: 2, max: 2 },
  cargo: ["Sugar", "Sugar", "Spice"],
  holdsGauge: false,
};

/** The defender after the rake: one mast, one crew and one hull hit. */
export const DEFENDER_AFTER: ProtoShip = {
  ...DEFENDER,
  hull: { current: 2, max: 4 },
  crew: { current: 2, max: 3 },
  moves: { current: 1, max: 2 },
};

/** The seat watching the fight from elsewhere on the map. */
export const BYSTANDER = { seat: "P3", captain: "Robert Surcouf", nation: "France" as Nation };

export const ROUND = 2;
export const SMOKE = true;

export const ORDERS: Record<"attacker" | "defender", { order: Order; aim?: Aim }> = {
  attacker: { order: "broadside", aim: "high" },
  defender: { order: "bearAway" },
};

export interface OrderInfo {
  name: string;
  /** What the order does, one line. */
  does: string;
  beats: Order;
  losesTo: Order;
  /** How this round's smoke bank changes it, or null. */
  smoke: string | null;
  /** How the weather gauge changes it for the ship that holds it, or null. */
  gauge: string | null;
}

export const ORDER_INFO: Record<Order, OrderInfo> = {
  broadside: {
    name: "Broadside",
    does: "Run out the guns and fire.",
    beats: "bearAway",
    losesTo: "closeIn",
    smoke: null,
    gauge: "You fire first if she fires too.",
  },
  closeIn: {
    name: "Close in",
    does: "Lay her aboard and fight crew against crew.",
    beats: "broadside",
    losesTo: "bearAway",
    smoke: "Through the smoke: roll 4+ and the grapples land whatever she orders; else you take a free broadside.",
    gauge: null,
  },
  bearAway: {
    name: "Bear away",
    does: "Turn downwind and run.",
    beats: "closeIn",
    losesTo: "broadside",
    smoke: "Into the smoke: +2 on the escape roll.",
    gauge: "+1 on the escape roll.",
  },
};

export const AIM_INFO: Record<Aim, { name: string; at: string; table: Place[]; summary: string }> = {
  high: { name: "Fire high", at: "on the up-roll, at the rigging", table: ["Mast", "Mast", "Crew", "Crew", "Cannons", "Hull"], summary: "1–2 mast, 3–4 crew, 5 cannons, 6 hull" },
  low: { name: "Fire low", at: "on the down-roll, at the waterline", table: ["Hull", "Hull", "Hull", "Cargo", "Cargo", "Cannons"], summary: "1–3 hull, 4–5 cargo, 6 cannons" },
};

export const MATCHUP = {
  name: "Raking fire",
  line: "The Resolute crosses the Belle Marie's turning stern. She cannot reply, then she tries to run.",
  winner: "attacker" as const,
};

export const VOLLEY = {
  hitOn: 5,
  dice: [6, 2, 5, 5],
  hits: [
    { d6: 1, place: "Mast" as Place, effect: "Mast sprung: −1 move a turn" },
    { d6: 4, place: "Crew" as Place, effect: "One of her crew falls" },
    { d6: 6, place: "Hull" as Place, effect: "Holed: −1 hull" },
  ],
};

export const ESCAPE = {
  fleer: { d6: 3, moves: 1, smoke: 2, gauge: 0, total: 6 },
  pursuer: { d6: 4, moves: 3, smoke: 0, gauge: 1, total: 8 },
  escaped: false,
  line: "She is caught. The fight goes on to round 3.",
};

export interface VariantProps {
  step: Step;
  seat: Seat;
  goTo: (step: Step) => void;
}
