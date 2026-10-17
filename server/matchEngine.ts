/**
 * The game's rules on the server (#112, #113, ADR 0008): the same `Caribbean`
 * game the browser runs, driven through boardgame.io's own reducer, so a
 * match played online follows exactly the rules of the local game. Pure: a
 * state in, a state (or a refusal) out; storage is the routes' business.
 */
import { CreateGameReducer, getFilterPlayerView, InitializeGame, ProcessGameConfig } from "boardgame.io/internal";
import type { State } from "boardgame.io";
import { Caribbean } from "../src/game/Game";
import { seatMayActInCombat } from "../src/game/combatActor";
import { withSeatedCombat } from "../src/game/seatedCombat";
import type { CaribbeanSetupData, CaribbeanState } from "../src/game/types";
import type { MatchAction } from "../src/online/matchSync";

export type { MatchAction };

export type MatchState = State<CaribbeanState>;


/** The game as the server runs it: combat moves refused from any seat but the step's actor. */
const SEATED = withSeatedCombat(Caribbean);
const reducer = CreateGameReducer({ game: SEATED });

/**
 * Every move the game defines, by its own name: the top-level moves and each
 * phase's. Only own keys, so `__proto__`, `constructor`, `toString` and the
 * rest of Object.prototype never pass as a move name (#113 security review).
 */
export const MOVE_NAMES: ReadonlySet<string> = new Set([
  ...Object.keys(Caribbean.moves ?? {}),
  ...Object.values(Caribbean.phases ?? {}).flatMap((phase) => Object.keys(phase.moves ?? {})),
]);

/** No move of the game takes more arguments than this. */
export const MAX_MOVE_ARGS = 4;
const filterView = getFilterPlayerView(ProcessGameConfig(SEATED));

/**
 * A new match's whole state: `numPlayers` seats on the map `setupData` names,
 * its dice and deck seeded with `seed` (`newMatchSeed`, never boardgame.io's
 * clock-based default). The seed stays in the state, which only the server
 * ever reads whole; every view drops it.
 */
export function createMatchState(numPlayers: number, setupData: Required<CaribbeanSetupData>, seed: string): MatchState {
  return InitializeGame({ game: { ...SEATED, seed }, numPlayers, setupData }) as MatchState;
}

/**
 * What `seat` may see of the match: `G` through the game's `playerView`
 * (`playerViewFor`, #109), the plugins' data through theirs (the random seed
 * removed), and no log, undo or redo history. The only form of a match that
 * leaves the server.
 */
export function viewFor(state: MatchState, seat: string): MatchState {
  const filtered = filterView(seat, { type: "update", args: ["match", state] });
  if (filtered.type !== "update") throw new Error("unexpected player view");
  const { deltalog: _deltalog, ...view } = filtered.args[1] as MatchState;
  void _deltalog;
  return view;
}

/**
 * May `seat` act now? In a fight, only the seat that presses the current
 * step (`seatMayActInCombat`, the rule the board and the combat moves share;
 * either captain for the legacy resolution, #380);
 * otherwise as boardgame.io's `isPlayerActive`: a seat in `activePlayers`
 * when set, else the current player.
 */
export function seatMayActNow(state: MatchState, seat: string): boolean {
  const { G, ctx } = state;
  if (G.combat) return seatMayActInCombat({ playerID: seat, combat: G.combat });
  if (ctx.activePlayers) return seat in ctx.activePlayers;
  return ctx.currentPlayer === seat;
}

export type ParsedAction = { ok: true; action: MatchAction } | { ok: false; error: string };

/**
 * The action in a request body, if it is one a client may send. Only two
 * kinds pass (#113, and the review of #293):
 * - `MAKE_MOVE` of a move by name with an array of arguments; whether the
 *   move exists, is allowed now and accepts the arguments is the reducer's
 *   call;
 * - `GAME_EVENT` `endTurn`, with no arguments, in the `main` phase only: the
 *   End Turn button. The draft ends its own turns, and a fight its phase.
 * Every other event (`setPhase`, `endPhase`, `endGame`, `setActivePlayers`,
 * stages), undo, redo, plugin actions and anything else is refused: the
 * game's moves change phase themselves, and a client that could do it would
 * break the game's state (a fight left half-resolved, a turn order skipped).
 */
export function parseAction(state: MatchState, seat: string, raw: unknown): ParsedAction {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "expected an action" };
  const { type, payload } = raw as { type?: unknown; payload?: unknown };
  if (typeof payload !== "object" || payload === null) return { ok: false, error: "expected an action" };
  const { type: name, args = [], playerID } = payload as { type?: unknown; args?: unknown; playerID?: unknown };
  if (typeof name !== "string" || name.length === 0 || name.length > 64) return { ok: false, error: "expected an action name" };
  if (!Array.isArray(args)) return { ok: false, error: "action arguments must be an array" };
  if (args.length > MAX_MOVE_ARGS) return { ok: false, error: "too many action arguments" };
  // The server acts for the caller's seat; an action naming any other is refused, not rewritten.
  if (playerID !== undefined && playerID !== seat) return { ok: false, error: "an action acts for your own seat only" };
  if (type === "MAKE_MOVE") {
    if (!MOVE_NAMES.has(name)) return { ok: false, error: "no such move" };
    return { ok: true, action: { type, payload: { type: name, args } } };
  }
  if (type === "GAME_EVENT") {
    if (name !== "endTurn" || args.length > 0) return { ok: false, error: `event not allowed: ${name}` };
    if (state.ctx.phase !== "main") return { ok: false, error: "End Turn only in the main phase" };
    return { ok: true, action: { type, payload: { type: name, args } } };
  }
  return { ok: false, error: "action not allowed" };
}

export type Applied = { ok: true; state: MatchState } | { ok: false; error: string };

/**
 * Runs `action` for `seat` through boardgame.io's reducer, as its server
 * would: the game's own checks decide (an unknown or disallowed move, an
 * invalid one, an inactive player). The new state has no deltalog.
 */
export function applyAction(state: MatchState, seat: string, action: MatchAction): Applied {
  const payload = { ...action.payload, playerID: seat };
  const reduced = action.type === "MAKE_MOVE" ? reducer(state, { type: "MAKE_MOVE", payload }) : reducer(state, { type: "GAME_EVENT", payload });
  const next = reduced as MatchState & {
    transients?: { error?: { type: string } };
  };
  if (next.transients?.error) return { ok: false, error: `move refused: ${next.transients.error.type}` };
  if (next._stateID === state._stateID) return { ok: false, error: "move refused" };
  const { transients: _transients, deltalog: _deltalog, ...clean } = next;
  void _transients;
  void _deltalog;
  // Undo is never allowed online, so its history (a copy of G per move) is not kept.
  return { ok: true, state: { ...clean, _undo: [], _redo: [] } as MatchState };
}
