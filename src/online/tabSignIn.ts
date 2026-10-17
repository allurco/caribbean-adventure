/**
 * A tab that comes aboard by itself (#280). Every way of signing in starts a
 * fresh page load in the tab that finishes it: the email link opens its own
 * tab, Discord and Google come back through a redirect. So a page that was
 * signed out and is now signed in, with no reload, heard it from another tab
 * of this browser (supabase-js's cross-tab auth events), such as the one the
 * email link opened. Pure, no React.
 */
import type { SessionState } from "./useAccount";

type SessionStatus = SessionState["status"];

/** The line a tab shows when it was signed in from another tab. */
export const SIGNED_IN_ELSEWHERE = "You are signed in: the sign-in finished in another tab.";

/** Whether going from `previous` to `next` is this tab signed in from another one. */
export function signedInFromAnotherTab(previous: SessionStatus, next: SessionStatus): boolean {
  return previous === "signedOut" && next === "signedIn";
}
