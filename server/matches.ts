/**
 * The match routes (#113, PRD #104 Authority and Concurrency): a seated
 * player reads their own view of the match, and the player holding the
 * current seat sends one action at a time. The server loads the match,
 * checks the seat and the action, runs boardgame.io's reducer over the
 * shared game code, and writes the new snapshot and the move log only if
 * the match is still at the `stateID` the action was made against.
 * Responses carry `viewFor(state, seat)`, never the whole state.
 */
import { fail, isUuid, json, readJsonObject } from "./http";
import { applyAction, parseAction, viewFor, type MatchState } from "./matchEngine";
import type { MatchRecord, OnlineStore } from "./onlineStore";

/** PRD #104: ten moves a second per player. */
export const MOVE_LIMIT = 10;
export const MOVE_WINDOW_SECONDS = 1;

interface Seated {
  match: MatchRecord;
  state: MatchState;
  seat: string;
}

/** The match and the caller's seat in it, or null if they hold none (a stranger cannot tell it exists). */
async function seatedIn(store: OnlineStore, matchId: string, userId: string): Promise<Seated | null> {
  if (!isUuid(matchId)) return null;
  const match = await store.getMatch(matchId);
  const seat = match?.seats.find((s) => s.userId === userId);
  if (!match || !seat) return null;
  return { match, state: match.state as MatchState, seat: String(seat.index) };
}

/** `GET /api/matches/:id[?since=<stateID>]`: the caller's view, or only `changed: false` if it is still at `since`. */
export async function getMatch(request: Request, matchId: string, userId: string, store: OnlineStore): Promise<Response> {
  const seated = await seatedIn(store, matchId, userId);
  if (!seated) return fail(404, "no such match");
  const { match, state, seat } = seated;
  const since = new URL(request.url).searchParams.get("since");
  if (since !== null && Number(since) === match.stateId) {
    return json({ ok: true, matchId: match.id, seat, changed: false, stateID: match.stateId });
  }
  return json({ ok: true, matchId: match.id, seat, changed: true, state: viewFor(state, seat) });
}

/** `POST /api/matches/:id/actions` with `{ stateID, action }`. */
export async function postAction(request: Request, matchId: string, userId: string, store: OnlineStore): Promise<Response> {
  const body = await readJsonObject(request);
  const seated = await seatedIn(store, matchId, userId);
  if (!seated) return fail(404, "no such match");
  if (!(await store.consumeRateLimit(userId, "move", MOVE_LIMIT, MOVE_WINDOW_SECONDS))) {
    return fail(429, "too many moves: slow down");
  }
  const { match, state, seat } = seated;
  const current = (extra: Record<string, unknown> = {}) => ({ matchId: match.id, seat, state: viewFor(state, seat), ...extra });

  if (!body || typeof body.stateID !== "number") return fail(400, "expected a stateID and an action");
  if (state.ctx.gameover !== undefined) return fail(409, "match over", current());
  if (state.ctx.currentPlayer !== seat) return fail(403, "not your turn", current());
  if (body.stateID !== match.stateId) return fail(409, "stale state", current());

  const parsed = parseAction(state, body.action);
  if (!parsed.ok) return fail(400, parsed.error, current());
  const applied = applyAction(state, seat, parsed.action);
  if (!applied.ok) return fail(400, applied.error, current());

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
    const latest = await seatedIn(store, matchId, userId);
    return fail(409, "stale state", latest ? { matchId: match.id, seat, state: viewFor(latest.state, seat) } : {});
  }
  return json({ ok: true, matchId: match.id, seat, state: viewFor(next, seat) });
}
