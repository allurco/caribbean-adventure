/**
 * The slice of the Supabase client the account code uses (#105), as plain
 * structural types: the real `SupabaseClient` satisfies it (checked in
 * `supabaseClient.ts`), and tests pass a small fake. Nothing here imports
 * supabase-js, so the hotseat bundle never loads it.
 */

/** A row of `public.profiles` (supabase/migrations). */
export interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  provider: string | null;
  provider_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientError {
  message: string;
}

export interface SessionLike {
  user: { id: string; email?: string };
}

export interface Unsubscribable {
  unsubscribe(): void;
}

export interface AuthPort {
  signInWithOtp(credentials: {
    email: string;
    options?: { emailRedirectTo?: string; shouldCreateUser?: boolean };
  }): PromiseLike<{ error: ClientError | null }>;
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

export interface AccountClient {
  auth: AuthPort;
  from(table: "profiles"): ProfilesTable;
}
