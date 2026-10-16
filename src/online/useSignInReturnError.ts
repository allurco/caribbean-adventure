import { useEffect, useState } from "react";
import { signInErrorParams, signInReturnError, withoutSignInError } from "./signInReturn";

/**
 * The message for a sign-in that came back failed or cancelled (#106), read
 * once from the page's URL; the error is then taken out of the address bar,
 * so a reload or a shared link does not show it again. The raw error goes
 * to the console only: the page shows our own sentence, never the link's text.
 */
export function useSignInReturnError(): string | null {
  const [message] = useState(() => signInReturnError(window.location.href));
  useEffect(() => {
    const raw = signInErrorParams(window.location.href);
    if (raw) console.warn("Sign-in came back with an error", raw);
    const clean = withoutSignInError(window.location.href);
    if (clean) window.history.replaceState(window.history.state, "", clean);
  }, []);
  return message;
}
