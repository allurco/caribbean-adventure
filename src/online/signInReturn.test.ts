import { describe, expect, it } from "vitest";
import { signInRedirectUrl, signInReturnError, withoutSignInError } from "./signInReturn";

const GENERIC = "Sign-in did not finish. Please try again.";

describe("signInRedirectUrl", () => {
  it("returns the player to the page they signed in from, on any host", () => {
    expect(signInRedirectUrl("http://localhost:5173/?view=account")).toBe("http://localhost:5173/?view=account");
    expect(signInRedirectUrl("https://game.example/")).toBe("https://game.example/");
    expect(signInRedirectUrl("https://game-git-x-team.vercel.app/?view=join&invite=abc")).toBe(
      "https://game-git-x-team.vercel.app/?view=join&invite=abc",
    );
  });

  it("leaves out the hash and the error of a sign-in that failed before", () => {
    expect(
      signInRedirectUrl("https://game.example/?view=account&error=access_denied&error_code=x&error_description=Nope#error=access_denied"),
    ).toBe("https://game.example/?view=account");
    expect(signInRedirectUrl("https://game.example/?error=server_error")).toBe("https://game.example/");
  });
});

describe("signInReturnError", () => {
  it("is null on an ordinary page, or a successful return", () => {
    expect(signInReturnError("https://game.example/")).toBeNull();
    expect(signInReturnError("https://game.example/?view=account")).toBeNull();
    expect(signInReturnError("https://game.example/#access_token=jwt&refresh_token=r&type=bearer")).toBeNull();
  });

  it("says the sign-in was cancelled when the player turned down the provider's consent", () => {
    const message = signInReturnError(
      "https://game.example/#error=access_denied&error_description=The+resource+owner+or+authorization+server+denied+the+request",
    );
    expect(message).toMatch(/cancelled/i);
  });

  it("reads the error from the query too", () => {
    expect(signInReturnError("https://game.example/?error=access_denied")).toMatch(/cancelled/i);
  });

  it("says an expired email link has expired, not that it was cancelled", () => {
    const message = signInReturnError(
      "https://game.example/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(message).toMatch(/expired/i);
    expect(message).not.toMatch(/cancelled/i);
  });

  it("says a provider email still to be verified needs verifying, in our own words", () => {
    // Supabase Auth's code for an unverified Discord or Google email (provider_email_needs_verification).
    const message = signInReturnError(
      "https://game.example/?error=access_denied&error_code=provider_email_needs_verification&error_description=Unverified+email+with+discord.+A+confirmation+email+has+been+sent+to+your+discord+email",
    );
    expect(message).toMatch(/verif/i);
    expect(message).not.toMatch(/cancelled/i);
    expect(message).not.toContain("Unverified email with discord");
  });

  it("says new sign-ups are closed when Supabase refuses them", () => {
    const message = signInReturnError("https://game.example/#error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed");
    expect(message).toMatch(/sign-ups|new captains/i);
    expect(message).not.toMatch(/cancelled/i);
  });

  it("gives one sentence of our own for any other failure, never the link's description", () => {
    expect(signInReturnError("https://game.example/?error=server_error&error_description=Database+error+saving+new+user")).toBe(
      GENERIC,
    );
    expect(signInReturnError("https://game.example/?error=server_error")).toBe(GENERIC);
    expect(signInReturnError("https://game.example/?error=access_denied&error_code=user_banned")).toBe(GENERIC);
  });

  it("shows none of a crafted link's text, whatever its error or code", () => {
    const attack = encodeURIComponent("Your account is locked. Call +1 555 0100 or visit https://evil.example/recover");
    for (const href of [
      `https://game.example/?error=server_error&error_description=${attack}`,
      `https://game.example/?error=access_denied&error_code=otp_expired&error_description=${attack}`,
      `https://game.example/#error=access_denied&error_description=${attack}`,
      `https://game.example/?error=${attack}&error_code=${attack}`,
    ]) {
      const message = signInReturnError(href) ?? "";
      expect(message, href).not.toMatch(/locked|555|evil/);
    }
  });
});

describe("withoutSignInError", () => {
  it("is null when there is nothing to clean", () => {
    expect(withoutSignInError("https://game.example/?view=account")).toBeNull();
    expect(withoutSignInError("https://game.example/#access_token=jwt")).toBeNull();
  });

  it("drops the error from the query and keeps the page", () => {
    expect(withoutSignInError("https://game.example/?view=account&error=access_denied&error_description=No")).toBe(
      "https://game.example/?view=account",
    );
  });

  it("drops an error hash", () => {
    expect(withoutSignInError("https://game.example/?view=account#error=access_denied&error_code=otp_expired")).toBe(
      "https://game.example/?view=account",
    );
  });
});
