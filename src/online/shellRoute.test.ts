import { describe, expect, it } from "vitest";
import { accountPath, profilePath } from "./accountRoute";
import { joinPath, matchPath, newRoomPath, roomPath } from "./onlineRoute";
import { comingPath, localGamePath, parseShellPage, playPath, shellPageForHref } from "./shellRoute";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CODE = "AbC-_0123456789xyzXYZ0";
const ORIGIN = "https://caribbean.example";

describe("parseShellPage", () => {
  it("opens Play at the root URL and at ?view=play", () => {
    expect(parseShellPage("")).toEqual({ kind: "play" });
    expect(parseShellPage("?view=play")).toEqual({ kind: "play" });
  });

  it("still opens Play when the sign-in link comes back with its own parameters", () => {
    expect(parseShellPage("?code=abc")).toEqual({ kind: "play" });
    expect(parseShellPage("?error=access_denied&error_code=otp_expired&error_description=x")).toEqual({ kind: "play" });
  });

  it("reads the coming sheets", () => {
    expect(parseShellPage("?view=lobby")).toEqual({ kind: "coming", screen: "lobby" });
    expect(parseShellPage("?view=party")).toEqual({ kind: "coming", screen: "party" });
    expect(parseShellPage("?view=ranked")).toEqual({ kind: "coming", screen: "ranked" });
  });

  it("hosts the account pages (#105) and the rooms (#112)", () => {
    expect(parseShellPage("?view=account")).toEqual({ kind: "account" });
    expect(parseShellPage(`?view=profile&id=${ID}`)).toEqual({ kind: "profile", id: ID });
    expect(parseShellPage("?view=rooms")).toEqual({ kind: "newRoom" });
    expect(parseShellPage(`?view=room&id=${ID}`)).toEqual({ kind: "room", id: ID });
    expect(parseShellPage(`?view=join&invite=${CODE}`)).toEqual({ kind: "join", inviteCode: CODE });
  });

  it("leaves the match board, the local game and the dev views outside the shell", () => {
    expect(parseShellPage(`?view=match&id=${ID}`)).toBeNull();
    expect(parseShellPage("?skipLogin=1")).toBeNull();
    expect(parseShellPage("?view=props")).toBeNull();
    expect(parseShellPage("?view=sound")).toBeNull();
    expect(parseShellPage("?seedGallery=1")).toBeNull();
    // the dev URL parameters (#74) keep opening the local game, as without a backend
    expect(parseShellPage("?size=small&seed=4")).toBeNull();
    expect(parseShellPage("?players=3")).toBeNull();
  });

  it("round-trips its own paths", () => {
    expect(parseShellPage(playPath().slice(1))).toEqual({ kind: "play" });
    expect(parseShellPage(comingPath("ranked").slice(1))).toEqual({ kind: "coming", screen: "ranked" });
    expect(parseShellPage(localGamePath().slice(1))).toBeNull();
  });
});

describe("shellPageForHref", () => {
  it("finds the shell page a same-origin link opens, so the shell can swap the sheet without a reload", () => {
    expect(shellPageForHref(`${ORIGIN}${comingPath("lobby")}`, ORIGIN)).toEqual({ kind: "coming", screen: "lobby" });
    expect(shellPageForHref(`${ORIGIN}${accountPath()}`, ORIGIN)).toEqual({ kind: "account" });
    expect(shellPageForHref(`${ORIGIN}${profilePath(ID)}`, ORIGIN)).toEqual({ kind: "profile", id: ID });
    expect(shellPageForHref(`${ORIGIN}${roomPath(ID)}`, ORIGIN)).toEqual({ kind: "room", id: ID });
    expect(shellPageForHref(`${ORIGIN}${newRoomPath()}`, ORIGIN)).toEqual({ kind: "newRoom" });
    expect(shellPageForHref(`${ORIGIN}/`, ORIGIN)).toEqual({ kind: "play" });
  });

  it("is null for links that leave the shell: the board, the local game, another site, another path", () => {
    expect(shellPageForHref(`${ORIGIN}${matchPath(ID)}`, ORIGIN)).toBeNull();
    expect(shellPageForHref(`${ORIGIN}${localGamePath()}`, ORIGIN)).toBeNull();
    expect(shellPageForHref(`https://elsewhere.example${comingPath("lobby")}`, ORIGIN)).toBeNull();
    expect(shellPageForHref(`${ORIGIN}/api/rooms`, ORIGIN)).toBeNull();
    expect(shellPageForHref("not a url", ORIGIN)).toBeNull();
  });

  it("is null for an invite link: joining takes a seat, so it loads as a page of its own", () => {
    expect(shellPageForHref(`${ORIGIN}${joinPath(CODE)}`, ORIGIN)).toBeNull();
  });
});
