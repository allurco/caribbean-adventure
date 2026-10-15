/**
 * The match routes of `/api` (#113) for the browser: a seat's view of its
 * match, and its actions. Over the same injected `fetch` and access token as
 * the rooms client (`roomApi.ts`); resolves to results, never throws.
 */
import type { MatchGetResult, MatchSendResult, MatchSyncApi, SentAction, SeatView } from "./matchSync";
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

export function createMatchApi(deps: ApiDeps): MatchSyncApi {
  const path = (id: string) => `/api/matches/${encodeURIComponent(id)}`;
  return {
    getMatch: (matchId, since) =>
      callApi<{ matchId: string; seat: string; changed: boolean; state?: SeatView; stateID?: number }>(
        deps,
        MATCH_MESSAGES,
        "GET",
        since === undefined ? path(matchId) : `${path(matchId)}?since=${since}`,
      ) as Promise<MatchGetResult>,
    sendAction: (matchId, stateID, action: SentAction) =>
      callApi<{ state: SeatView }>(deps, MATCH_MESSAGES, "POST", `${path(matchId)}/actions`, { stateID, action }) as Promise<MatchSendResult>,
  };
}
