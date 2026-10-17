/**
 * Sign-in and profile operations (#105) over an injected `AccountClient`:
 * the real Supabase client in the app, a fake in tests. Every function
 * resolves to a result, never throws on a backend error, so components only
 * show what comes back.
 */
import type { AccountClient, ProfileRow } from "./accountClient";
import { safeAvatarUrl } from "./avatarUrl";
import { validateDisplayName } from "./displayName";
import { OAUTH_PROVIDERS, type OAuthProvider } from "./oauthProviders";
import { callApi, type ApiDeps, type Messages } from "./roomApi";

export type Result = { ok: true } | { ok: false; error: string };

/** What a profile page shows; public to anyone. */
export interface Profile {
  id: string;
  displayName: string;
  /** Only ever a safe https URL (`safeAvatarUrl`), else null. */
  avatarUrl: string | null;
  /** The account was deleted (#108): this is the "deleted player" placeholder. */
  deleted: boolean;
}

export type ProfileResult = { ok: true; profile: Profile | null } | { ok: false; error: string };

/** The signed-in player, as the account pages need them. */
export interface AccountSession {
  userId: string;
  email: string | null;
}

const PROFILE_COLUMNS = "id, display_name, avatar_url, deleted_at";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails a sign-in link that brings the player back to `redirectTo`. */
export async function sendMagicLink(client: AccountClient, rawEmail: string, redirectTo: string): Promise<Result> {
  const email = rawEmail.trim();
  if (!EMAIL.test(email)) return { ok: false, error: "That does not look like an email address." };
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Starts a Discord or Google sign-in that brings the player back to
 * `redirectTo`. On success supabase-js sends the browser to the provider, so
 * the page is about to unload; a result comes back only on failure.
 */
export async function signInWithProvider(client: AccountClient, provider: OAuthProvider, redirectTo: string): Promise<Result> {
  try {
    const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (thrown) {
    return { ok: false, error: thrown instanceof Error ? thrown.message : "Sign-in could not start." };
  }
}

export type LinkedProvidersResult = { ok: true; providers: OAuthProvider[] } | { ok: false; error: string };

/** The Discord and Google accounts the signed-in player signs in with; only their own are readable. */
export async function fetchLinkedProviders(client: AccountClient, id: string): Promise<LinkedProvidersResult> {
  const { data, error } = await client.identities().select("provider").eq("profile_id", id);
  if (error) return { ok: false, error: error.message };
  const linked = new Set((Array.isArray(data) ? data : []).map((row) => row.provider));
  return { ok: true, providers: OAUTH_PROVIDERS.filter((provider) => linked.has(provider)) };
}

export async function signOut(client: AccountClient): Promise<Result> {
  const { error } = await client.auth.signOut();
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * The supabase-js auth event a session change came with (`SIGNED_IN`,
 * `SIGNED_OUT`, `TOKEN_REFRESHED`, `INITIAL_SESSION`, ...), or null for
 * `watchSession`'s own first read.
 */
export type AuthEvent = string | null;

/**
 * Calls `onChange` with the current session (null when signed out), then on
 * every auth event, with its name, until the returned function is called.
 * That includes another tab's (#280): supabase-js posts each auth event on a
 * BroadcastChannel named after its storage key, and every other tab's client
 * re-emits it here. An event that comes before the first read wins over it:
 * the read can only be older news.
 */
export function watchSession(
  client: AccountClient,
  onChange: (session: AccountSession | null, event: AuthEvent) => void,
): () => void {
  let live = true;
  let heard = false;
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, session) => {
    heard = true;
    if (live) onChange(toAccountSession(session), event);
  });
  void client.auth.getSession().then(({ data }) => {
    if (live && !heard) onChange(toAccountSession(data.session), null);
  });
  return () => {
    live = false;
    subscription.unsubscribe();
  };
}

/** The signed-in player's current access token, for `/api`; null when signed out. */
export async function accessToken(client: AccountClient): Promise<string | null> {
  const { data, error } = await client.auth.getSession();
  return error ? null : (data.session?.access_token ?? null);
}

export async function fetchProfile(client: AccountClient, id: string): Promise<ProfileResult> {
  const { data, error } = await client.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, profile: data ? toProfile(data) : null };
}

/** Sets the player's own display name, after the same checks the table makes. */
export async function saveDisplayName(client: AccountClient, id: string, rawName: string): Promise<ProfileResult> {
  const name = validateDisplayName(rawName);
  if (!name.ok) return { ok: false, error: name.reason };
  const { data, error } = await client
    .from("profiles")
    .update({ display_name: name.value })
    .eq("id", id)
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That profile could not be changed." };
  return { ok: true, profile: toProfile(data) };
}

const DELETE_MESSAGES: Messages = {
  unauthorized: "Your sign-in could not be checked. Sign out, sign in again and try once more.",
  rate_limited: "Too many tries. Wait an hour and try again.",
  internal: "The account could not be deleted. Try again in a moment.",
};

/**
 * Deletes the signed-in player's account (#108) through `POST /api/me/delete`,
 * which acts for the access token's user alone, then drops this device's
 * session: the server has removed the sign-in already, so there is nothing to
 * sign out of but the local copy. On a refusal the player stays signed in.
 *
 * The server answering `account_deleted` (401) to a token this device still
 * holds means the account is gone already: another tab deleted it, or this
 * request's own answer was lost and the retry finds nothing. That counts as
 * done. Any other 401 (an expired token, the sign-in check failing) is a
 * sign-in problem: the player stays signed in and is told so.
 */
export async function deleteAccount(client: AccountClient, api: ApiDeps): Promise<Result> {
  if (!(await api.accessToken())) return { ok: false, error: "Sign in first." };
  const result = await callApi<object>(api, DELETE_MESSAGES, "POST", "/api/me/delete");
  if (!result.ok && result.code !== "account_deleted") return { ok: false, error: result.error };
  const { error } = await client.auth.signOut({ scope: "local" });
  return error ? { ok: false, error: `Your account is deleted, but this device could not sign out: ${error.message}` } : { ok: true };
}

function toProfile(row: Pick<ProfileRow, "id" | "display_name" | "avatar_url" | "deleted_at">): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: safeAvatarUrl(row.avatar_url),
    deleted: typeof row.deleted_at === "string",
  };
}

function toAccountSession(session: { user: { id: string; email?: string } } | null): AccountSession | null {
  return session ? { userId: session.user.id, email: session.user.email ?? null } : null;
}
