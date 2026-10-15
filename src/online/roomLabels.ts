/** Words for a room's settings and seats (#112). Pure. */

/** "24 hours a turn", "2 minutes a turn": the turn timer in its largest whole unit. */
export function turnTimerLabel(seconds: number): string {
  if (seconds % 3600 === 0) return seconds === 3600 ? "an hour a turn" : `${seconds / 3600} hours a turn`;
  if (seconds % 60 === 0) return seconds === 60 ? "a minute a turn" : `${seconds / 60} minutes a turn`;
  return `${seconds} seconds a turn`;
}

/** Who sits at seat `index`, as the lobby marks it: "you", "host", both, or nothing. */
export function seatRole(index: number, room: { yourSeat: number | null; hostSeat: number | null }): string {
  return [index === room.yourSeat ? "you" : null, index === room.hostSeat ? "host" : null].filter(Boolean).join(", ");
}
