import { describe, expect, it } from "vitest";
import { joinPath, matchPath, newRoomPath, parseOnlineRoute, roomPath } from "./onlineRoute";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CODE = "AbC-_0123456789xyzXYZ0";

describe("parseOnlineRoute", () => {
  it("reads the new-room, room and join views", () => {
    expect(parseOnlineRoute("?view=rooms")).toEqual({ kind: "newRoom" });
    expect(parseOnlineRoute(`?view=room&id=${ID.toUpperCase()}`)).toEqual({ kind: "room", id: ID });
    expect(parseOnlineRoute(`?view=join&invite=${CODE}`)).toEqual({ kind: "join", inviteCode: CODE });
    expect(parseOnlineRoute(`?view=match&id=${ID}`)).toEqual({ kind: "match", id: ID });
    expect(parseOnlineRoute("?view=match&id=x")).toEqual({ kind: "match", id: null });
  });

  it("keeps the view but drops a malformed id or invite code", () => {
    expect(parseOnlineRoute("?view=room&id=nope")).toEqual({ kind: "room", id: null });
    expect(parseOnlineRoute("?view=room")).toEqual({ kind: "room", id: null });
    expect(parseOnlineRoute("?view=join&invite=short")).toEqual({ kind: "join", inviteCode: null });
    expect(parseOnlineRoute("?view=join&invite=" + "a".repeat(23))).toEqual({ kind: "join", inviteCode: null });
  });

  it("is null for every other view", () => {
    expect(parseOnlineRoute("")).toBeNull();
    expect(parseOnlineRoute("?view=account")).toBeNull();
    expect(parseOnlineRoute("?seed=4")).toBeNull();
  });

  it("round-trips its own paths", () => {
    expect(parseOnlineRoute(newRoomPath().slice(1))).toEqual({ kind: "newRoom" });
    expect(parseOnlineRoute(roomPath(ID).slice(1))).toEqual({ kind: "room", id: ID });
    expect(parseOnlineRoute(joinPath(CODE).slice(1))).toEqual({ kind: "join", inviteCode: CODE });
    expect(parseOnlineRoute(matchPath(ID).slice(1))).toEqual({ kind: "match", id: ID });
  });
});
