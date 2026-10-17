import { useState } from "react";
import { signedInFromAnotherTab } from "./tabSignIn";
import type { SessionState } from "./useAccount";

/**
 * Whether to say this tab was signed in from another (#280): from the moment
 * it comes aboard by itself until the player moves to another page or signs
 * out. Follows the session's status from render to render.
 */
export function useTabSignInNotice(status: SessionState["status"], page: string): boolean {
  const [previous, setPrevious] = useState(status);
  const [shownOn, setShownOn] = useState<string | null>(null);
  if (previous !== status) {
    setPrevious(status);
    setShownOn(signedInFromAnotherTab(previous, status) ? page : null);
  }
  return shownOn === page;
}
