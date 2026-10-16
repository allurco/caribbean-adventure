import { describe, expect, it } from "vitest";
import { signInRedirectUrl, signInReturnError, withoutSignInError } from "./signInReturn";

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

  it("passes any other failure on with the backend's description, as plain text", () => {
    const message = signInReturnError(
      "https://game.example/?error=server_error&error_description=Unverified+email+with+discord.+A+confirmation+email+has+been+sent+to+your+discord+email",
    );
    expect(message).toBe(
      "Sign-in did not finish: Unverified email with discord. A confirmation email has been sent to your discord email",
    );
  });

  it("still says something when the backend gave no description", () => {
    expect(signInReturnError("https://game.example/?error=server_error")).toBe("Sign-in did not finish. Please try again.");
  });

  it("keeps a crafted description short and on one line", () => {
    const long = "x".repeat(500);
    const message = signInReturnError(`https://game.example/?error=e&error_description=${long}%0A%0Aevil`) ?? "";
    expect(message.length).toBeLessThanOrEqual(220);
    expect(message).not.toMatch(/[\n\r]/);
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
