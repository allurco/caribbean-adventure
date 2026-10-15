import { describe, expect, it } from "vitest";
import { activeNav, nameboardFor, SHELL_NAV } from "./shellNav";
import { parseShellPage } from "./shellRoute";

const ME = "0f8fad5b-d9cb-469f-a165-70867728950e";
const RIVAL = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("SHELL_NAV", () => {
  it("lists Play, Lobby, Party, Ranked and Profile, in that order, each opening a shell page", () => {
    expect(SHELL_NAV.map((item) => item.label)).toEqual(["Play", "Lobby", "Party", "Ranked", "Profile"]);
    for (const item of SHELL_NAV) expect(parseShellPage(item.href.slice(1))).not.toBeNull();
  });
});

describe("activeNav", () => {
  it("lights Play on Play and on everything reached from it: a new room, a room, an invite", () => {
    expect(activeNav({ kind: "play" }, ME)).toBe("play");
    expect(activeNav({ kind: "newRoom" }, ME)).toBe("play");
    expect(activeNav({ kind: "room", id: RIVAL }, ME)).toBe("play");
    expect(activeNav({ kind: "join", inviteCode: null }, ME)).toBe("play");
  });

  it("lights each coming screen's own item", () => {
    expect(activeNav({ kind: "coming", screen: "lobby" }, ME)).toBe("lobby");
    expect(activeNav({ kind: "coming", screen: "party" }, ME)).toBe("party");
    expect(activeNav({ kind: "coming", screen: "ranked" }, ME)).toBe("ranked");
  });

  it("lights Profile on your own page and your own public profile, but not on a rival's", () => {
    expect(activeNav({ kind: "account" }, ME)).toBe("profile");
    expect(activeNav({ kind: "profile", id: ME }, ME)).toBe("profile");
    expect(activeNav({ kind: "profile", id: RIVAL }, ME)).toBeNull();
    expect(activeNav({ kind: "profile", id: ME }, null)).toBeNull();
  });
});

describe("nameboardFor", () => {
  it("names each screen on the hanging nameboard", () => {
    expect(nameboardFor({ kind: "play" }).title).toBe("Play");
    expect(nameboardFor({ kind: "coming", screen: "lobby" }).title).toBe("Lobby");
    expect(nameboardFor({ kind: "coming", screen: "party" }).title).toBe("Party");
    expect(nameboardFor({ kind: "coming", screen: "ranked" }).title).toBe("Ranked");
    expect(nameboardFor({ kind: "account" }).title).toBe("Your captain");
    expect(nameboardFor({ kind: "profile", id: RIVAL }).title).toBe("Captain's profile");
    expect(nameboardFor({ kind: "newRoom" }).title).toBe("A private room");
    expect(nameboardFor({ kind: "room", id: RIVAL }).title).toBe("The room");
    expect(nameboardFor({ kind: "join", inviteCode: null }).title).toBe("An invitation");
  });

  it("gives the screens built later a line saying they are coming", () => {
    expect(nameboardFor({ kind: "coming", screen: "ranked" }).meta).toMatch(/coming/i);
    expect(nameboardFor({ kind: "play" }).meta).not.toMatch(/coming/i);
  });
});
