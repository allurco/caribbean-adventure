import { beforeEach, describe, expect, it } from "vitest";
import { handleApiRequest, type ApiServices } from "./handleApiRequest";
import { createMemoryOnlineStore, type MemoryOnlineStore } from "./memoryOnlineStore";
import { ACCOUNT_DELETION_LIMIT } from "./account";
import { accountGone } from "./onlineStore";
import { DELETED_PLAYER_NAME } from "../src/online/displayName";

// Deleting your account (#108): `POST /api/me/delete` through handleApiRequest
// with the in-memory store and a token table.
const ANNE = "00000000-0000-4000-8000-00000000000a";
const JACK = "00000000-0000-4000-8000-00000000000b";
const MARY = "00000000-0000-4000-8000-00000000000c";
const ANNE_AGAIN = "00000000-0000-4000-8000-00000000000d";
const TOKENS: Record<string, string> = { anne: ANNE, jack: JACK, mary: MARY, "anne-again": ANNE_AGAIN };
const NAMES: Record<string, string> = { [ANNE]: "Anne Bonny", [JACK]: "Calico Jack", [MARY]: "Mary Read" };

let store: MemoryOnlineStore;
let services: ApiServices;
let codes: number;

beforeEach(() => {
  codes = 0;
  store = createMemoryOnlineStore({ displayName: (id) => NAMES[id] ?? null });
  services = {
    // As supabaseAuthVerifier: a token whose sign-in identity is deleted reads as a deleted account.
    auth: async (token) => {
      const id = TOKENS[token];
      if (id && (await store.peekSignInDeleted(id))) throw accountGone();
      return id ?? null;
    },
    store,
    newInviteCode: () => `invite-code-${String(++codes).padStart(10, "0")}`,
    newMapSeed: () => 4242,
    newMatchSeed: () => "match-seed",
  };
});

function call(method: string, path: string, token?: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return handleApiRequest(
    new Request(`https://game.example${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    {},
    services,
  );
}

const deleteAccount = (token?: string, body?: unknown) => call("POST", "/api/me/delete", token, body);

interface RoomBody {
  id: string;
  inviteCode: string;
  status: string;
  hostSeat: number | null;
  matchId: string | null;
  seats: { index: number; userId: string; displayName: string | null }[];
}

async function roomOf(res: Response): Promise<RoomBody> {
  return ((await res.json()) as { room: RoomBody }).room;
}

async function openRoom(token: string, seats = 2): Promise<RoomBody> {
  return roomOf(await call("POST", "/api/rooms", token, { seats, mapSize: "small", mapSeed: 5 }));
}

async function startedMatch(): Promise<RoomBody> {
  const room = await openRoom("anne");
  await call("POST", "/api/rooms/join", "jack", { inviteCode: room.inviteCode });
  return roomOf(await call("POST", `/api/rooms/${room.id}/start`, "anne"));
}

describe("POST /api/me/delete", () => {
  it("needs a signed-in player", async () => {
    for (const res of [await deleteAccount(), await deleteAccount("forged")]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: "unauthorized" });
    }
  });

  it("answers a retry with the deleted account's token as account_deleted, apart from a dead token", async () => {
    expect((await deleteAccount("anne")).status).toBe(200);
    const retry = await deleteAccount("anne");
    expect(retry.status).toBe(401);
    expect(await retry.json()).toMatchObject({ code: "account_deleted" });
  });

  it("answers only POST", async () => {
    expect((await call("GET", "/api/me/delete", "anne")).status).toBe(405);
  });

  it("anonymises the caller's profile, then deletes their sign-in identity", async () => {
    const res = await deleteAccount("anne");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await store.peekProfileDeleted(ANNE)).toBe(true);
    expect(await store.peekSignInDeleted(ANNE)).toBe(true);
    // The token no longer reaches anything.
    expect((await call("GET", "/api/me/rooms", "anne")).status).toBe(401);
  });

  it("deletes only the caller, whatever id the body names", async () => {
    const res = await deleteAccount("anne", { userId: JACK, id: JACK });
    expect(res.status).toBe(200);
    expect(await store.peekProfileDeleted(JACK)).toBe(false);
    expect(await store.peekSignInDeleted(JACK)).toBe(false);
    expect(await store.peekProfileDeleted(ANNE)).toBe(true);
  });

  it("keeps a started match's seat, shown to the others as a deleted player", async () => {
    const room = await startedMatch();
    expect((await deleteAccount("anne")).status).toBe(200);
    const seen = await roomOf(await call("GET", `/api/rooms/${room.id}`, "jack"));
    expect(seen.status).toBe("started");
    expect(seen.hostSeat).toBe(0);
    expect(seen.seats).toEqual([
      { index: 0, userId: ANNE, displayName: DELETED_PLAYER_NAME },
      { index: 1, userId: JACK, displayName: "Calico Jack" },
    ]);
    expect((await call("GET", `/api/matches/${room.matchId}`, "jack")).status).toBe(200);
  });

  it("clears when the deleted player's seats were last seen, keeping the others'", async () => {
    const room = await startedMatch();
    expect((await call("GET", `/api/matches/${room.matchId}`, "anne")).status).toBe(200);
    expect((await call("GET", `/api/matches/${room.matchId}`, "jack")).status).toBe(200);
    expect((await store.seatsLastSeen(room.id)).every((s) => s.lastSeenAt !== null)).toBe(true);
    expect((await deleteAccount("anne")).status).toBe(200);
    const seen = await store.seatsLastSeen(room.id);
    expect(seen[0].lastSeenAt).toBeNull();
    expect(seen[1].lastSeenAt).not.toBeNull();
  });

  it("leaves the rooms still open: the seat is freed, and a room they hosted passes to the lowest seat left", async () => {
    const annes = await openRoom("anne", 3);
    await call("POST", "/api/rooms/join", "jack", { inviteCode: annes.inviteCode });
    const jacks = await openRoom("jack", 3);
    await call("POST", "/api/rooms/join", "anne", { inviteCode: jacks.inviteCode });

    expect((await deleteAccount("anne")).status).toBe(200);

    const hosted = await roomOf(await call("GET", `/api/rooms/${annes.id}`, "jack"));
    expect(hosted.seats).toEqual([{ index: 1, userId: JACK, displayName: "Calico Jack" }]);
    expect(hosted.hostSeat).toBe(1);
    expect((await roomOf(await call("GET", `/api/rooms/${annes.id}`, "jack"))).hostSeat).toBe(1);
    const joined = await roomOf(await call("GET", `/api/rooms/${jacks.id}`, "jack"));
    expect(joined.seats).toEqual([{ index: 0, userId: JACK, displayName: "Calico Jack" }]);
    expect(joined.hostSeat).toBe(0);
    // The freed seat can be taken.
    const mary = await roomOf(await call("POST", "/api/rooms/join", "mary", { inviteCode: jacks.inviteCode }));
    expect(mary.seats.map((s) => s.userId)).toEqual([JACK, MARY]);
  });

  it("closes an open room nobody else sits in", async () => {
    const room = await openRoom("anne");
    expect((await deleteAccount("anne")).status).toBe(200);
    expect(await store.getRoom(room.id)).toBeNull();
    expect((await call("POST", "/api/rooms/join", "jack", { inviteCode: room.inviteCode })).status).toBe(404);
  });

  it("can be asked again after deleting the sign-in failed, and finishes the job", async () => {
    const room = await startedMatch();
    const deleteSignIn = store.deleteSignIn;
    store.deleteSignIn = async () => {
      throw new Error("auth is down");
    };
    expect((await deleteAccount("anne")).status).toBe(500);
    // The profile is already anonymised: nothing personal is left while the identity waits.
    expect(await store.peekProfileDeleted(ANNE)).toBe(true);
    expect(await store.peekSignInDeleted(ANNE)).toBe(false);

    store.deleteSignIn = deleteSignIn;
    expect((await deleteAccount("anne")).status).toBe(200);
    expect(await store.peekSignInDeleted(ANNE)).toBe(true);
    const seen = await roomOf(await call("GET", `/api/rooms/${room.id}`, "jack"));
    expect(seen.seats.map((s) => s.displayName)).toEqual([DELETED_PLAYER_NAME, "Calico Jack"]);
  });

  it("is rate limited", async () => {
    store.deleteSignIn = async () => {
      throw new Error("auth is down");
    };
    for (let i = 0; i < ACCOUNT_DELETION_LIMIT.limit; i++) expect((await deleteAccount("anne")).status).toBe(500);
    const res = await deleteAccount("anne");
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "rate_limited" });
    expect((await deleteAccount("jack")).status).toBe(500);
  });

  it("hands a hosted room to the lowest seat left, who can then start it", async () => {
    const room = await openRoom("anne", 3);
    await call("POST", "/api/rooms/join", "mary", { inviteCode: room.inviteCode });
    await call("POST", "/api/rooms/join", "jack", { inviteCode: room.inviteCode });
    expect((await deleteAccount("anne")).status).toBe(200);

    const left = await roomOf(await call("GET", `/api/rooms/${room.id}`, "jack"));
    expect(left.seats.map((s) => s.userId)).toEqual([MARY, JACK]);
    expect(left.hostSeat).toBe(1);
    expect(await store.getRoom(room.id)).toMatchObject({ hostId: MARY });
    await call("POST", "/api/rooms/join", "anne-again", { inviteCode: room.inviteCode });
    expect((await call("POST", `/api/rooms/${room.id}/start`, "jack")).status).toBe(403);
    expect((await call("POST", `/api/rooms/${room.id}/start`, "mary")).status).toBe(201);
  });
});

describe("a deletion that lands while a match is being started (#108)", () => {
  it("frees the seat and reopens the room: the start is refused, nothing is left half-started", async () => {
    const room = await openRoom("anne");
    await call("POST", "/api/rooms/join", "jack", { inviteCode: room.inviteCode });
    const startMatch = store.startMatch;
    // The host's account goes after the start is claimed, before the match is stored.
    store.startMatch = async (...args) => {
      await store.anonymiseAccount(ANNE);
      return startMatch(...args);
    };
    const res = await call("POST", `/api/rooms/${room.id}/start`, "anne");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "account_deleted" });
    expect(await store.getRoom(room.id)).toMatchObject({ status: "open", hostId: JACK, matchId: null });
    expect((await store.getRoom(room.id))?.seats.map((s) => s.userId)).toEqual([JACK]);
  });

  it("frees a guest's seat too, and the host's start then finds the room open again", async () => {
    const room = await openRoom("anne");
    await call("POST", "/api/rooms/join", "jack", { inviteCode: room.inviteCode });
    const startMatch = store.startMatch;
    store.startMatch = async (...args) => {
      await store.anonymiseAccount(JACK);
      return startMatch(...args);
    };
    expect((await call("POST", `/api/rooms/${room.id}/start`, "anne")).status).toBe(409);
    expect(await store.getRoom(room.id)).toMatchObject({ status: "open", hostId: ANNE, matchId: null });
    expect((await store.getRoom(room.id))?.seats.map((s) => s.userId)).toEqual([ANNE]);
  });
});

describe("a deleted profile whose sign-in still works (#108)", () => {
  // The profile is anonymised first and the sign-in deleted second, so a
  // token can outlive the profile for a moment, or for good if the second
  // step fails. It may not act through /api in the meantime.
  let deleteSignIn: MemoryOnlineStore["deleteSignIn"];

  beforeEach(() => {
    deleteSignIn = store.deleteSignIn;
    store.deleteSignIn = async () => {
      throw new Error("auth is down");
    };
  });

  it("cannot open a room", async () => {
    expect((await deleteAccount("anne")).status).toBe(500);
    const res = await call("POST", "/api/rooms", "anne", { seats: 2, mapSize: "small", mapSeed: 5 });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "account_deleted" });
  });

  it("cannot take a seat", async () => {
    const room = await openRoom("jack");
    expect((await deleteAccount("anne")).status).toBe(500);
    expect((await call("POST", "/api/rooms/join", "anne", { inviteCode: room.inviteCode })).status).toBe(401);
    expect((await store.getRoom(room.id))?.seats.map((s) => s.userId)).toEqual([JACK]);
  });

  it("cannot move in a started match", async () => {
    const room = await startedMatch();
    expect((await deleteAccount("anne")).status).toBe(500);
    const view = (await (await call("GET", `/api/matches/${room.matchId}`, "anne")).json()) as { state: { _stateID: number } };
    const move = { stateID: view.state._stateID, action: { type: "MAKE_MOVE", payload: { type: "pickCaptain", args: [0, "Sloop"] } } };
    expect((await call("POST", `/api/matches/${room.matchId}/actions`, "anne", move)).status).toBe(401);
    expect(await store.peekMoves(room.matchId!)).toEqual([]);
  });

  it("can still finish deleting the account", async () => {
    expect((await deleteAccount("anne")).status).toBe(500);
    store.deleteSignIn = deleteSignIn;
    expect((await deleteAccount("anne")).status).toBe(200);
    expect(await store.peekSignInDeleted(ANNE)).toBe(true);
  });
});

describe("a request that passed the sign-in check just before the account went (#108)", () => {
  it("answers 401, not 500, once the sign-in is gone", async () => {
    // Another tab deleted the account between this request's token check and its work.
    services.auth = async (token) => TOKENS[token] ?? null;
    await store.anonymiseAccount(ANNE);
    await store.deleteSignIn(ANNE);
    const res = await deleteAccount("anne");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "account_deleted" });
  });
});
