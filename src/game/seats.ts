/**
 * How many seats a match has (#278): its `ctx.numPlayers`, from 1 to 4. A
 * local game is solo by default, one seat against the NPC merchants and
 * flotillas; more seats are a hotseat or an online match.
 */

/** The fewest seats a match may have: one captain against the NPCs. */
export const MIN_SEATS = 1;

/** The most seats a match may have. */
export const MAX_SEATS = 4;

/** The seats of a local game unless asked for more (dev `?players=`). */
export const DEFAULT_SEATS = 1;

/** Whether `n` is a seat count a match may have: a whole number from 1 to 4. */
export function isValidSeatCount(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_SEATS && n <= MAX_SEATS;
}

/**
 * Whether a player id is a seat's: one digit, the seat's index, as
 * boardgame.io numbers them; never an NPC's id (`npc-3`). The SQL in
 * `supabase/migrations/*_voyages_fight.sql` checks the same `^[0-9]$`.
 */
export function isSeatId(id: string): boolean {
  return /^[0-9]$/.test(id);
}

/** A seat by its number, "Player n" (counting from 1): how the game names a seat without a captain to name. */
export function seatLabel(seat: string): string {
  return `Player ${Number(seat) + 1}`;
}
