/**
 * The match routes of `/api` (#113) for the browser: a seat's view of its
 * match, and its actions. Over the same injected `fetch` and access token as
 * the rooms client (`roomApi.ts`); resolves to results, never throws.
 */
import type { MatchAction, MatchSyncApi, SeatView } from "./matchSync";
import { callApi, type ApiDeps, type Messages } from "./roomApi";

const MATCH_MESSAGES: Messages = {
  not_your_turn: "It is not your turn.",
  stale_state: "The match moved on before your order arrived. Here is where it stands.",
  move_refused: "That order cannot be carried out.",
  rate_limited: "Too many orders at once. Slow down.",
  match_over: "This match is over.",
  not_found: "No match of yours behind that link.",
  payload_too_large: "That order is too long.",
};

type MatchRead = { seat: string } & ({ changed: true; state: SeatView } | { changed: false; stateID: number });

export function createMatchApi(deps: ApiDeps): MatchSyncApi {
  const path = (id: string) => `/api/matches/${encodeURIComponent(id)}`;
  return {
    getMatch: (matchId, since) =>
      callApi<MatchRead>(deps, MATCH_MESSAGES, "GET", since === undefined ? path(matchId) : `${path(matchId)}?since=${since}`),
    sendAction: (matchId, stateID, action: MatchAction) =>
      callApi<{ state: SeatView }>(deps, MATCH_MESSAGES, "POST", `${path(matchId)}/actions`, { stateID, action }),
  };
}
