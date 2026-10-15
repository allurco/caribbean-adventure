/**
 * Captain death and replacement (#265). A captain dies only when the player
 * loses their ship (sunk, or taken by boarding, #258). The player keeps
 * their glory and stashed gold, and loses the ship, its cargo, its gold, its
 * bounties and the mission. At the start of their next turn they are dealt
 * a hand from the captain deck, as in the draft, and the captain they pick
 * starts clean (no pirate record; bounties already paid stay paid) on a
 * starter ship at their home port, and sails that same turn.
 *
 * A captain who dies is out of the game: never dealt again. Captains dealt
 * and not picked live, and go back to the bottom of the deck. A hand is two
 * captains, or the one left; when none is left to deal, the player is out
 * of the game (eliminated) with the glory they had, and takes no more turns.
 *
 * Between the loss and the pick (or for good, once out) the seat is in
 * `G.lostShips` and not in `G.ships`. Pure functions over `G`; `Game.ts` wires them into the moves
 * and the turn.
 */
import { isCaptainPick, takeCommand } from "./captains";
import { createShipState } from "./economy";
import { hex } from "./hex";
import type { CaribbeanState, ShipClass, ShipLossCause } from "./types";

/** The size of a replacement hand: a draft hand's. */
const HAND_SIZE = 2;

/** Whether `playerId` has lost their ship and has yet to pick a new captain (an eliminated player never will). */
export function awaitingCaptain(G: Pick<CaribbeanState, "lostShips">, playerId: string): boolean {
  const lost = G.lostShips?.[playerId];
  return lost !== undefined && !lost.eliminated;
}

/** Whether `playerId` is out of the game: their ship was lost and no captain was left to deal them. */
export function isEliminated(G: Pick<CaribbeanState, "lostShips">, playerId: string): boolean {
  return G.lostShips?.[playerId]?.eliminated === true;
}

/**
 * The winner once every one of `seats` is out of the game: the most glory,
 * a tie going to the first seat, as `findWinner` breaks one. Null while any
 * seat is still in the game.
 */
export function winnerWhenAllOut(G: Pick<CaribbeanState, "lostShips">, seats: readonly string[]): string | null {
  if (seats.length === 0 || !seats.every((seat) => isEliminated(G, seat))) return null;
  let winner = seats[0];
  for (const seat of seats) {
    if (G.lostShips![seat].score > G.lostShips![winner].score) winner = seat;
  }
  return winner;
}

/**
 * `playerId` loses their ship to `cause`: it leaves `G.ships`, and its
 * captain dies with it, out of the game for good. What the player keeps (glory, stashed gold) waits in
 * `G.lostShips` for the next captain. Any loot or bounty the loss pays must
 * be settled before this. Nothing for a seat with no ship.
 */
export function loseShip(G: CaribbeanState, playerId: string, cause: ShipLossCause): void {
  const ship = G.ships[playerId];
  if (!ship) return;
  G.lostShips ??= {};
  G.lostShips[playerId] = {
    cause,
    ...(ship.captain ? { captain: ship.captain } : {}),
    score: ship.score,
    stashedGold: ship.stashedGold,
  };
  delete G.ships[playerId];
}

/**
 * The start of a seat's turn: a seat awaiting a captain with no hand yet is
 * dealt one from the top of the deck, into `draftHands` like a draft hand:
 * two captains, or the one left. With none left, the player is out of the
 * game instead (`isEliminated`).
 */
export function dealReplacementHand(G: CaribbeanState, playerId: string): void {
  if (!awaitingCaptain(G, playerId)) return;
  if ((G.draftHands[playerId]?.length ?? 0) > 0) return;
  if (G.captainDeck.length === 0) {
    G.lostShips![playerId].eliminated = true;
    return;
  }
  G.draftHands[playerId] = G.captainDeck.splice(0, HAND_SIZE);
}

/**
 * The seat picks captain `captainIndex` of its hand and a starter
 * `shipClass`: a fresh ship at the captain's home port, with the player's
 * glory and stashed gold. The captain not picked goes to the bottom of the
 * deck; the pirate record goes, and the flotillas hunting the dead captain
 * are called off. False, and nothing changed, when the pick is not allowed.
 */
export function replaceCaptain(
  G: CaribbeanState,
  playerId: string,
  captainIndex: number,
  shipClass: ShipClass,
): boolean {
  const lost = awaitingCaptain(G, playerId) ? G.lostShips![playerId] : undefined;
  const hand = G.draftHands[playerId] ?? [];
  if (!lost || !isCaptainPick(hand, captainIndex, shipClass)) return false;

  const ship = createShipState(hex(0, 0), shipClass);
  ship.score = lost.score;
  ship.stashedGold = lost.stashedGold;
  takeCommand(G, playerId, ship, hand[captainIndex], shipClass);
  G.ships[playerId] = ship;

  G.captainDeck.push(...hand.filter((_, i) => i !== captainIndex));
  G.draftHands[playerId] = [];
  delete G.lostShips![playerId];
  delete G.pirates?.[playerId];
  for (const npc of Object.values(G.npcs)) {
    if (npc.huntingTargetId === playerId) npc.huntingTargetId = null;
  }
  return true;
}
