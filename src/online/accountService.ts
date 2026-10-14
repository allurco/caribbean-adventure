/**
 * Sign-in and profile operations (#105) over an injected `AccountClient`:
 * the real Supabase client in the app, a fake in tests. Every function
 * resolves to a result, never throws on a backend error, so components only
 * show what comes back.
 */
import type { AccountClient, ProfileRow } from "./accountClient";
import { validateDisplayName } from "./displayName";

export type Result = { ok: true } | { ok: false; error: string };

/** What a profile page shows; public to anyone. */
export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export type ProfileResult = { ok: true; profile: Profile | null } | { ok: false; error: string };

/** The signed-in player, as the account pages need them. */
export interface AccountSession {
  userId: string;
  email: string | null;
}

const PROFILE_COLUMNS = "id, display_name, avatar_url";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails a sign-in link that brings the player back to `redirectTo`. */
export async function sendMagicLink(client: AccountClient, rawEmail: string, redirectTo: string): Promise<Result> {
  const email = rawEmail.trim();
  if (!EMAIL.test(email)) return { ok: false, error: "That does not look like an email address." };
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(client: AccountClient): Promise<Result> {
  const { error } = await client.auth.signOut();
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Calls `onChange` with the current session (null when signed out), then on
 * every sign-in and sign-out, until the returned function is called.
 */
export function watchSession(client: AccountClient, onChange: (session: AccountSession | null) => void): () => void {
  let live = true;
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    if (live) onChange(toAccountSession(session));
  });
  void client.auth.getSession().then(({ data }) => {
    if (live) onChange(toAccountSession(data.session));
  });
  return () => {
    live = false;
    subscription.unsubscribe();
  };
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

function toProfile(row: Pick<ProfileRow, "id" | "display_name" | "avatar_url">): Profile {
  return { id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url };
}

function toAccountSession(session: { user: { id: string; email?: string } } | null): AccountSession | null {
  return session ? { userId: session.user.id, email: session.user.email ?? null } : null;
}
