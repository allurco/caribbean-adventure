import { useState } from "react";
import type { AuthEvent } from "./accountService";
import { initialTabSignIn, nextTabSignIn, type TabSignInInput } from "./tabSignIn";
import type { SessionState } from "./useAccount";

/** Whether to say this tab was signed in from another (#280); the rule is `nextTabSignIn`. */
export function useTabSignInNotice(session: SessionState, page: string): boolean {
  const event: AuthEvent = session.status === "loading" ? null : (session.event ?? null);
  const input: TabSignInInput = { status: session.status, event, page };
  const [seen, setSeen] = useState(input);
  const [notice, setNotice] = useState(() => initialTabSignIn(session.status, page));
  if (seen.status !== input.status || seen.event !== input.event || seen.page !== input.page) {
    setSeen(input);
    setNotice(nextTabSignIn(notice, input));
  }
  return notice.shown;
}
