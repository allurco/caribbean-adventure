import { describe, expect, it, vi } from "vitest";
import type { AccountClient, IdentitiesResult, ProfileRow, RowResult, SessionLike } from "./accountClient";
import {
  accessToken,
  fetchLinkedProviders,
  fetchProfile,
  saveDisplayName,
  sendMagicLink,
  signInWithProvider,
  signOut,
  watchSession,
} from "./accountService";

const ID = "3f1c2b4a-9d8e-4f7a-b6c5-1a2b3c4d5e6f";

function row(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: ID,
    display_name: "Captain 3f1c2b",
    avatar_url: null,
    created_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:00:00Z",
    ...overrides,
  };
}

interface Calls {
  otp: unknown[];
  oauth: unknown[];
  identities: { columns: string; column: string; value: string }[];
  selects: { columns: string; column: string; value: string }[];
  updates: { values: unknown; column: string; value: string }[];
  signOuts: number;
}

function fakeClient(opts: {
  otpError?: string;
  oauthError?: string;
  oauthThrows?: string;
  identities?: IdentitiesResult;
  signOutError?: string;
  session?: SessionLike | null;
  select?: RowResult;
  update?: RowResult;
} = {}): { client: AccountClient; calls: Calls; emit: (session: SessionLike | null) => void; unsubscribe: () => void } {
  const calls: Calls = { otp: [], oauth: [], identities: [], selects: [], updates: [], signOuts: 0 };
  const listeners: ((event: string, session: SessionLike | null) => void)[] = [];
  const unsubscribe = vi.fn();
  const client: AccountClient = {
    auth: {
      signInWithOtp: async (credentials) => {
        calls.otp.push(credentials);
        return { error: opts.otpError ? { message: opts.otpError } : null };
      },
      signInWithOAuth: async (credentials) => {
        calls.oauth.push(credentials);
        if (opts.oauthThrows) throw new Error(opts.oauthThrows);
        return opts.oauthError
          ? { data: { url: null }, error: { message: opts.oauthError } }
          : { data: { url: "https://project.supabase.co/auth/v1/authorize" }, error: null };
      },
      signOut: async () => {
        calls.signOuts++;
        return { error: opts.signOutError ? { message: opts.signOutError } : null };
      },
      getSession: async () => ({ data: { session: opts.session ?? null }, error: null }),
      onAuthStateChange: (cb) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe } } };
      },
    },
    from: () => ({
      select: (columns) => ({
        eq: (column, value) => ({
          maybeSingle: async () => {
            calls.selects.push({ columns, column, value });
            return opts.select ?? { data: null, error: null };
          },
        }),
      }),
      update: (values) => ({
        eq: (column, value) => ({
          select: () => ({
            maybeSingle: async () => {
              calls.updates.push({ values, column, value });
              return opts.update ?? { data: null, error: null };
            },
          }),
        }),
      }),
    }),
    identities: () => ({
      select: (columns) => ({
        eq: async (column, value) => {
          calls.identities.push({ columns, column, value });
          return opts.identities ?? { data: [], error: null };
        },
      }),
    }),
  };
  return { client, calls, emit: (s) => listeners.forEach((l) => l("SIGNED_IN", s)), unsubscribe };
}

describe("sendMagicLink", () => {
  it("asks for a link that returns to the given page", async () => {
    const { client, calls } = fakeClient();
    const result = await sendMagicLink(client, "  anne@example.com ", "https://game.example/?view=account");
    expect(result).toEqual({ ok: true });
    expect(calls.otp).toEqual([
      { email: "anne@example.com", options: { emailRedirectTo: "https://game.example/?view=account" } },
    ]);
  });

  it("refuses something that is not an email address without calling out", async () => {
    const { client, calls } = fakeClient();
    expect(await sendMagicLink(client, "anne", "https://game.example/")).toMatchObject({ ok: false });
    expect(await sendMagicLink(client, "", "https://game.example/")).toMatchObject({ ok: false });
    expect(calls.otp).toEqual([]);
  });

  it("passes the backend's error on", async () => {
    const { client } = fakeClient({ otpError: "Email rate limit exceeded" });
    expect(await sendMagicLink(client, "anne@example.com", "https://game.example/")).toEqual({
      ok: false,
      error: "Email rate limit exceeded",
    });
  });
});

describe("signInWithProvider", () => {
  it("starts the provider's sign-in, to come back to the given page", async () => {
    const { client, calls } = fakeClient();
    expect(await signInWithProvider(client, "discord", "https://game.example/?view=account")).toEqual({ ok: true });
    expect(await signInWithProvider(client, "google", "http://localhost:5173/")).toEqual({ ok: true });
    expect(calls.oauth).toEqual([
      { provider: "discord", options: { redirectTo: "https://game.example/?view=account" } },
      { provider: "google", options: { redirectTo: "http://localhost:5173/" } },
    ]);
  });

  it("passes the backend's error on", async () => {
    const { client } = fakeClient({ oauthError: "Unsupported provider: provider is not enabled" });
    expect(await signInWithProvider(client, "discord", "https://game.example/")).toEqual({
      ok: false,
      error: "Unsupported provider: provider is not enabled",
    });
  });

  it("reports a failure to start instead of throwing", async () => {
    const { client } = fakeClient({ oauthThrows: "storage unavailable" });
    expect(await signInWithProvider(client, "google", "https://game.example/")).toEqual({
      ok: false,
      error: "storage unavailable",
    });
  });
});

describe("fetchLinkedProviders", () => {
  it("lists the providers the player signs in with, in a fixed order", async () => {
    const { client, calls } = fakeClient({ identities: { data: [{ provider: "google" }, { provider: "discord" }], error: null } });
    expect(await fetchLinkedProviders(client, ID)).toEqual({ ok: true, providers: ["discord", "google"] });
    expect(calls.identities).toEqual([{ columns: "provider", column: "profile_id", value: ID }]);
  });

  it("ignores a provider it does not know", async () => {
    const { client } = fakeClient({ identities: { data: [{ provider: "github" }, { provider: "discord" }], error: null } });
    expect(await fetchLinkedProviders(client, ID)).toEqual({ ok: true, providers: ["discord"] });
  });

  it("is empty for a player who signs in by email alone", async () => {
    const { client } = fakeClient({ identities: { data: null, error: null } });
    expect(await fetchLinkedProviders(client, ID)).toEqual({ ok: true, providers: [] });
  });

  it("reports a failure", async () => {
    const { client } = fakeClient({ identities: { data: null, error: { message: "boom" } } });
    expect(await fetchLinkedProviders(client, ID)).toEqual({ ok: false, error: "boom" });
  });
});

describe("signOut", () => {
  it("signs out", async () => {
    const { client, calls } = fakeClient();
    expect(await signOut(client)).toEqual({ ok: true });
    expect(calls.signOuts).toBe(1);
  });

  it("reports a failure", async () => {
    const { client } = fakeClient({ signOutError: "offline" });
    expect(await signOut(client)).toEqual({ ok: false, error: "offline" });
  });
});

describe("watchSession", () => {
  it("reports the current session, then each change, until stopped", async () => {
    const session = { user: { id: ID, email: "anne@example.com" } };
    const { client, emit, unsubscribe } = fakeClient({ session });
    const seen: (string | null)[] = [];
    const stop = watchSession(client, (s) => seen.push(s ? s.userId : null));
    await vi.waitFor(() => expect(seen).toEqual([ID]));
    emit(null);
    expect(seen).toEqual([ID, null]);
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("drops the first read when stopped before it lands", async () => {
    const { client } = fakeClient({ session: { user: { id: ID } } });
    const seen: unknown[] = [];
    const stop = watchSession(client, (s) => seen.push(s));
    stop();
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([]);
  });
});

describe("fetchProfile", () => {
  it("reads one profile by id", async () => {
    const { client, calls } = fakeClient({ select: { data: row(), error: null } });
    expect(await fetchProfile(client, ID)).toEqual({
      ok: true,
      profile: { id: ID, displayName: "Captain 3f1c2b", avatarUrl: null },
    });
    expect(calls.selects).toEqual([{ columns: "id, display_name, avatar_url", column: "id", value: ID }]);
  });

  it("drops an avatar URL that is not a safe https URL", async () => {
    for (const avatar_url of ["javascript:alert(1)", "http://cdn.example/a.png", "data:image/png;base64,AAAA"]) {
      const { client } = fakeClient({ select: { data: row({ avatar_url }), error: null } });
      expect(await fetchProfile(client, ID)).toMatchObject({ ok: true, profile: { avatarUrl: null } });
    }
    const avatar = "https://cdn.discordapp.com/avatars/1/a.png";
    const { client } = fakeClient({ select: { data: row({ avatar_url: avatar }), error: null } });
    expect(await fetchProfile(client, ID)).toMatchObject({ ok: true, profile: { avatarUrl: avatar } });
  });

  it("is null for nobody", async () => {
    const { client } = fakeClient({ select: { data: null, error: null } });
    expect(await fetchProfile(client, ID)).toEqual({ ok: true, profile: null });
  });

  it("reports a failure", async () => {
    const { client } = fakeClient({ select: { data: null, error: { message: "boom" } } });
    expect(await fetchProfile(client, ID)).toEqual({ ok: false, error: "boom" });
  });
});

describe("saveDisplayName", () => {
  it("writes the cleaned-up name to the player's own row", async () => {
    const { client, calls } = fakeClient({ update: { data: row({ display_name: "Anne Bonny" }), error: null } });
    expect(await saveDisplayName(client, ID, "  Anne   Bonny ")).toEqual({
      ok: true,
      profile: { id: ID, displayName: "Anne Bonny", avatarUrl: null },
    });
    expect(calls.updates).toEqual([{ values: { display_name: "Anne Bonny" }, column: "id", value: ID }]);
  });

  it("refuses an invalid name without calling out", async () => {
    const { client, calls } = fakeClient();
    expect(await saveDisplayName(client, ID, "   ")).toMatchObject({ ok: false });
    expect(calls.updates).toEqual([]);
  });

  it("fails when no row came back: row-level security let nothing through", async () => {
    const { client } = fakeClient({ update: { data: null, error: null } });
    expect(await saveDisplayName(client, ID, "Anne")).toMatchObject({ ok: false });
  });

  it("reports a backend error", async () => {
    const { client } = fakeClient({ update: { data: null, error: { message: "denied" } } });
    expect(await saveDisplayName(client, ID, "Anne")).toEqual({ ok: false, error: "denied" });
  });
});

describe("accessToken", () => {
  it("is the signed-in session's token, for /api (#112)", async () => {
    const { client } = fakeClient({ session: { user: { id: ID }, access_token: "jwt" } });
    expect(await accessToken(client)).toBe("jwt");
  });

  it("is null when signed out", async () => {
    const { client } = fakeClient({ session: null });
    expect(await accessToken(client)).toBeNull();
  });
});
