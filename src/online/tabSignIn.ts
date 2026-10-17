/**
 * A tab that comes aboard by itself (#280). Every way of signing in starts a
 * fresh page load in the tab that finishes it: the email link opens its own
 * tab, Discord and Google come back through a redirect. So a `SIGNED_IN`
 * that reaches a page already showing signed out came from another tab of
 * this browser (supabase-js's cross-tab auth events), such as the one the
 * email link opened. Any other way back to signed in, such as the tab's own
 * expired session refreshed (`TOKEN_REFRESHED`), says nothing. Pure, no React.
 */
import type { AuthEvent } from "./accountService";

/** `SessionState["status"]` of `useAccount.ts`, spelled out so the browser tests can import this module. */
export type SessionStatus = "loading" | "signedOut" | "signedIn";

/** The line a tab shows when it was signed in from another tab. */
export const SIGNED_IN_ELSEWHERE = "You are signed in: the sign-in finished in another tab.";

/** What the notice follows: the session's status, the event that brought it, and the shell's page. */
export interface TabSignInInput {
  status: SessionStatus;
  event: AuthEvent;
  page: string;
}

export interface TabSignIn {
  status: SessionStatus;
  page: string;
  /** Whether the page says it was signed in from another tab. */
  shown: boolean;
}

export function initialTabSignIn(status: SessionStatus, page: string): TabSignIn {
  return { status, page, shown: false };
}

/**
 * The notice after `input`: shown on a `SIGNED_IN` that finds the tab signed
 * out, kept while the player stays signed in on that page, gone on any page
 * change or sign-out and never back by itself.
 */
export function nextTabSignIn(state: TabSignIn, input: TabSignInInput): TabSignIn {
  const cameAboard = state.status === "signedOut" && input.status === "signedIn" && input.event === "SIGNED_IN";
  const kept = state.shown && input.status === "signedIn" && input.page === state.page;
  return { status: input.status, page: input.page, shown: cameAboard || kept };
}
