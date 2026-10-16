import { describe, expect, it } from "vitest";
import { accountPath, parseAccountRoute, profilePath } from "./accountRoute";

const ID = "3f1c2b4a-9d8e-4f7a-b6c5-1a2b3c4d5e6f";

describe("parseAccountRoute", () => {
  it("is null for the game and the other views", () => {
    expect(parseAccountRoute("")).toBeNull();
    expect(parseAccountRoute("?view=props")).toBeNull();
    expect(parseAccountRoute("?size=small&seed=4")).toBeNull();
  });

  it("reads the account view", () => {
    expect(parseAccountRoute("?view=account")).toEqual({ kind: "account" });
  });

  it("reads a profile view with a player's id", () => {
    expect(parseAccountRoute(`?view=profile&id=${ID}`)).toEqual({ kind: "profile", id: ID });
    expect(parseAccountRoute(`?view=profile&id=${ID.toUpperCase()}`)).toEqual({ kind: "profile", id: ID });
  });

  it("treats a profile view without a valid id as not found", () => {
    expect(parseAccountRoute("?view=profile")).toEqual({ kind: "profile", id: null });
    expect(parseAccountRoute("?view=profile&id=nope")).toEqual({ kind: "profile", id: null });
  });
});

describe("paths", () => {
  it("round-trip through the parser", () => {
    expect(parseAccountRoute(accountPath().slice(1))).toEqual({ kind: "account" });
    expect(parseAccountRoute(profilePath(ID).slice(1))).toEqual({ kind: "profile", id: ID });
    expect(accountPath()).toBe("/?view=account");
  });
});
