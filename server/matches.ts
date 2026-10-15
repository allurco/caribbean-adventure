/**
 * The match routes (#113, PRD #104 Authority and Concurrency): a seated
 * player reads their own view of the match, and the seat that may act now
 * (`seatMayActNow`: the current player, or in a fight the step's actor)
 * sends one action at a time. The server loads the match, checks the seat
 * and the action, runs boardgame.io's reducer over the shared game code, and
 * writes the new snapshot and the move log only if the match is still at the
 * `stateID` the action was made against. Responses carry
 * `viewFor(state, seat)`, never the whole state.
 */
import { fail, isUuid, json, readBoundedJsonObject } from "./http";
import { applyAction, parseAction, seatMayActNow, viewFor, type MatchState } from "./matchEngine";
import type { OnlineStore, SeatRecord } from "./onlineStore";

/** PRD #104: ten actions a second per player; and, so a steady stream cannot run all day, 120 a minute. */
export const MOVE_LIMITS = [
  { action: "move", limit: 10, windowSeconds: 1 },
  { action: "move_minute", limit: 120, windowSeconds: 60 },
] as const;

/** Reads: 60 a minute per player, four times the 4-second poll (`MATCH_POLL_MS`). */
export const READ_LIMIT = { action: "read_match", limit: 60, windowSeconds: 60 } as const;

/** An action's body is a few hundred bytes; past this it is refused before parsing (413). */
export const MAX_ACTION_BODY_BYTES = 4096;

/** The caller's seat among `seats`, as boardgame.io's playerID, or null. */
function seatOf(seats: readonly SeatRecord[], userId: string): string | null {
  const seat = seats.find((s) => s.userId === userId);
  return seat ? String(seat.index) : null;
}

/** A response's view of the match for `seat`: the only form of a match that leaves the server. */
function seatView(matchId: string, seat: string, state: MatchState) {
  return { matchId, seat, state: viewFor(state, seat) };
}

/** `GET /api/matches/:id[?since=<stateID>]`: the caller's view, or only `changed: false` if it is still at `since`. */
export async function getMatch(request: Request, matchId: string, userId: string, store: OnlineStore): Promise<Response> {
  if (!isUuid(matchId)) return fail(404, "not_found", "no such match");
  const { action, limit, windowSeconds } = READ_LIMIT;
  if (!(await store.consumeRateLimit(userId, action, limit, windowSeconds))) {
    return fail(429, "rate_limited", "too many reads: slow down");
  }
  // The state id and seats first: an unchanged match is answered without loading its state.
  const head = await store.getMatchHead(matchId);
  const seat = head && seatOf(head.seats, userId);
  if (!head || seat === null) return fail(404, "not_found", "no such match");
  const since = new URL(request.url).searchParams.get("since");
  if (since !== null && !/^\d+$/.test(since)) return fail(400, "bad_request", "since must be a state id");
  if (since !== null && Number(since) === head.stateId) {
    return json({ ok: true, matchId: head.id, seat, changed: false, stateID: head.stateId });
  }
  const match = await store.getMatch(matchId);
  if (!match) return fail(404, "not_found", "no such match");
  return json({ ok: true, changed: true, ...seatView(match.id, seat, match.state as MatchState) });
}

/** `POST /api/matches/:id/actions` with `{ stateID, action }`. */
export async function postAction(request: Request, matchId: string, userId: string, store: OnlineStore): Promise<Response> {
  // Bounded before anything else: an oversized body is never parsed or replayed.
  const read = await readBoundedJsonObject(request, MAX_ACTION_BODY_BYTES);
  if (read.kind === "too_large") return fail(413, "payload_too_large", "an action is a few hundred bytes");
  if (!isUuid(matchId)) return fail(404, "not_found", "no such match");
  for (const { action, limit, windowSeconds } of MOVE_LIMITS) {
    if (!(await store.consumeRateLimit(userId, action, limit, windowSeconds))) {
      return fail(429, "rate_limited", "too many moves: slow down");
    }
  }
  const match = await store.getMatch(matchId);
  const seat = match && seatOf(match.seats, userId);
  if (!match || seat === null) return fail(404, "not_found", "no such match");
  const state = match.state as MatchState;
  const current = () => seatView(match.id, seat, state);

  const body = read.kind === "object" ? read.body : null;
  if (!body || typeof body.stateID !== "number") return fail(400, "bad_request", "expected a stateID and an action");
  if (state.ctx.gameover !== undefined) return fail(409, "match_over", "match over", current());
  if (!seatMayActNow(state, seat)) return fail(403, "not_your_turn", "not your turn", current());
  if (body.stateID !== match.stateId) return fail(409, "stale_state", "stale state", current());

  const parsed = parseAction(state, seat, body.action);
  if (!parsed.ok) return fail(400, "move_refused", parsed.error, current());
  const applied = applyAction(state, seat, parsed.action);
  if (!applied.ok) return fail(400, "move_refused", applied.error, current());

  const next = applied.state;
  const committed = await store.commitMove({
    matchId: match.id,
    expectedStateId: match.stateId,
    state: next,
    stateId: next._stateID,
    phase: next.ctx.phase ?? null,
    finished: next.ctx.gameover !== undefined,
    move: {
      seat: Number(seat),
      userId,
      kind: parsed.action.type === "MAKE_MOVE" ? "move" : "event",
      name: parsed.action.payload.type,
      args: parsed.action.payload.args,
      stateIdBefore: match.stateId,
      stateIdAfter: next._stateID,
    },
  });
  if (!committed) {
    // Another write won: send what is there now.
    const latest = await store.getMatch(matchId);
    return fail(409, "stale_state", "stale state", latest ? seatView(match.id, seat, latest.state as MatchState) : {});
  }
  return json({ ok: true, ...seatView(match.id, seat, next) });
}
