/**
 * The slice of the Supabase client the account code uses (#105), as plain
 * structural types: the real `SupabaseClient` satisfies it (checked in
 * `supabaseClient.ts`), and tests pass a small fake. Nothing here imports
 * supabase-js, so the hotseat bundle never loads it.
 */

import type { OAuthProvider } from "./oauthProviders";

/** A row of `public.profiles` (supabase/migrations): public fields only. */
export interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientError {
  message: string;
}

export interface SessionLike {
  user: { id: string; email?: string };
  /** The JWT `/api` checks (#112); supabase-js refreshes it in `getSession`. */
  access_token?: string;
}

export interface Unsubscribable {
  unsubscribe(): void;
}

export interface AuthPort {
  signInWithOtp(credentials: {
    email: string;
    options?: { emailRedirectTo?: string; shouldCreateUser?: boolean };
  }): PromiseLike<{ error: ClientError | null }>;
  /** Starts a Discord or Google sign-in (#106): supabase-js sends the browser to the provider. */
  signInWithOAuth(credentials: {
    provider: OAuthProvider;
    options?: { redirectTo?: string };
  }): PromiseLike<{ data: { url: string | null }; error: ClientError | null }>;
  signOut(): PromiseLike<{ error: ClientError | null }>;
  getSession(): PromiseLike<{ data: { session: SessionLike | null }; error: ClientError | null }>;
  onAuthStateChange(callback: (event: string, session: SessionLike | null) => void): {
    data: { subscription: Unsubscribable };
  };
}

export interface RowResult {
  data: ProfileRow | null;
  error: ClientError | null;
}

export interface ProfilesTable {
  select(columns: string): {
    eq(column: string, value: string): { maybeSingle(): PromiseLike<RowResult> };
  };
  update(values: { display_name: string }): {
    eq(column: string, value: string): {
      select(columns: string): { maybeSingle(): PromiseLike<RowResult> };
    };
  };
}

/** A row of `public.profile_identities` (#106), as far as the client reads it; only its owner may. */
export interface IdentityRow {
  provider: string;
}

export interface IdentitiesResult {
  data: IdentityRow[] | null;
  error: ClientError | null;
}

export interface IdentitiesTable {
  select(columns: string): { eq(column: string, value: string): PromiseLike<IdentitiesResult> };
}

export interface AccountClient {
  auth: AuthPort;
  from(table: "profiles"): ProfilesTable;
  /** `public.profile_identities` (#106): the Discord and Google accounts a player signs in with. */
  identities(): IdentitiesTable;
}
