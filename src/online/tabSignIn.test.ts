import { describe, expect, it } from "vitest";
import { initialTabSignIn, nextTabSignIn, type TabSignIn } from "./tabSignIn";

const ACCOUNT = "account";
const PLAY = "play";

/** Feeds each (status, event, page) in turn, from a tab that loaded signed out on the account page. */
function play(steps: Parameters<typeof nextTabSignIn>[1][], from: TabSignIn = initialTabSignIn("signedOut", ACCOUNT)): TabSignIn {
  return steps.reduce(nextTabSignIn, from);
}

describe("the tab sign-in notice (#280)", () => {
  it("shows when a tab that was signed out, waiting for the email link, hears another tab sign in", () => {
    expect(play([{ status: "signedIn", event: "SIGNED_IN", page: ACCOUNT }]).shown).toBe(true);
  });

  it("stays silent for a page that loads signed in: the tab the link opened, or a return from Discord or Google", () => {
    const loading = initialTabSignIn("loading", ACCOUNT);
    expect(play([{ status: "signedIn", event: "SIGNED_IN", page: ACCOUNT }], loading).shown).toBe(false);
    expect(play([{ status: "signedIn", event: null, page: ACCOUNT }], loading).shown).toBe(false);
  });

  it("stays silent when the tab's own expired session comes back by a token refresh", () => {
    // Reloaded offline with an expired token: INITIAL_SESSION says signed out, then the refresh lands.
    const loading = initialTabSignIn("loading", ACCOUNT);
    const steps = [
      { status: "signedOut", event: "INITIAL_SESSION", page: ACCOUNT },
      { status: "signedIn", event: "TOKEN_REFRESHED", page: ACCOUNT },
    ] as const;
    expect(play([...steps], loading).shown).toBe(false);
  });

  it("goes on the first page change and does not come back on returning", () => {
    const aboard = play([{ status: "signedIn", event: "SIGNED_IN", page: ACCOUNT }]);
    const away = nextTabSignIn(aboard, { status: "signedIn", event: "SIGNED_IN", page: PLAY });
    expect(away.shown).toBe(false);
    expect(nextTabSignIn(away, { status: "signedIn", event: "SIGNED_IN", page: ACCOUNT }).shown).toBe(false);
  });

  it("stays through later events on the same page, and goes on signing out", () => {
    const aboard = play([{ status: "signedIn", event: "SIGNED_IN", page: ACCOUNT }]);
    const refreshed = nextTabSignIn(aboard, { status: "signedIn", event: "TOKEN_REFRESHED", page: ACCOUNT });
    expect(refreshed.shown).toBe(true);
    expect(nextTabSignIn(refreshed, { status: "signedOut", event: "SIGNED_OUT", page: ACCOUNT }).shown).toBe(false);
  });
});
