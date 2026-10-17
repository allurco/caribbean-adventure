import { describe, expect, it } from "vitest";
import { signedInFromAnotherTab } from "./tabSignIn";

describe("signedInFromAnotherTab (#280)", () => {
  it("is a tab that was signed out, waiting for the email link, coming aboard by itself", () => {
    expect(signedInFromAnotherTab("signedOut", "signedIn")).toBe(true);
  });

  it("is not a page that loads signed in: the tab the link opened, or a return from Discord or Google", () => {
    expect(signedInFromAnotherTab("loading", "signedIn")).toBe(false);
  });

  it("is not a sign-out, nor a session that stays as it was", () => {
    expect(signedInFromAnotherTab("signedIn", "signedOut")).toBe(false);
    expect(signedInFromAnotherTab("signedIn", "signedIn")).toBe(false);
    expect(signedInFromAnotherTab("loading", "signedOut")).toBe(false);
  });
});
