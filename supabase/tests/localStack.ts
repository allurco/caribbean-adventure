/**
 * The local Supabase the database tests run against (`npx supabase start`,
 * which needs Docker). The URL and keys come from SUPABASE_TEST_URL,
 * SUPABASE_TEST_ANON_KEY and SUPABASE_TEST_SERVICE_ROLE_KEY when set, else
 * from `supabase status` (the local stack's well-known development keys).
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** The database tests run only with SUPABASE_DB_TESTS=1 (`npm run test:db`). */
export const dbTestsEnabled = process.env.SUPABASE_DB_TESTS === "1";

export interface LocalStack {
  url: string;
  anonKey: string;
  serviceKey: string;
}

export function localStack(): LocalStack {
  const env = process.env;
  if (env.SUPABASE_TEST_URL && env.SUPABASE_TEST_ANON_KEY && env.SUPABASE_TEST_SERVICE_ROLE_KEY) {
    return { url: env.SUPABASE_TEST_URL, anonKey: env.SUPABASE_TEST_ANON_KEY, serviceKey: env.SUPABASE_TEST_SERVICE_ROLE_KEY };
  }
  const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" })) as Record<
    string,
    string | undefined
  >;
  const url = status.API_URL;
  const anonKey = status.ANON_KEY ?? status.PUBLISHABLE_KEY;
  const serviceKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("`supabase status` gave no API URL and keys: is `npx supabase start` running?");
  return { url, anonKey, serviceKey };
}

export const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const PASSWORD = "local-test-password-1";

export interface TestPlayer {
  id: string;
  client: SupabaseClient;
  /** The player's access token, as the browser sends it to /api. */
  accessToken: string;
}

/** Creates throwaway signed-in players; `deleteAll` removes them. */
export function testPlayers(stack: () => LocalStack, admin: () => SupabaseClient) {
  const players: TestPlayer[] = [];
  return {
    async create(userMetadata?: Record<string, string>): Promise<TestPlayer> {
      const email = `rls-${randomUUID()}@example.test`;
      const { data, error } = await admin().auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (error || !data.user) throw error ?? new Error("no user");
      const client = createClient(stack().url, stack().anonKey, NO_SESSION);
      const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
      if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error("no session");
      const player = { id: data.user.id, client, accessToken: signIn.data.session.access_token };
      players.push(player);
      return player;
    },
    async deleteAll(): Promise<void> {
      for (const p of players) await admin().auth.admin.deleteUser(p.id);
    },
  };
}

/** `supabase status` takes seconds, so its DB URL is read once per test process. */
let statusDbUrl: string | undefined;

/** The local stack's database URL: SUPABASE_TEST_DB_URL when set, else `supabase status`'s. */
function ownerDbUrl(): string {
  const override = process.env.SUPABASE_TEST_DB_URL;
  if (override) return override;
  statusDbUrl ??= (JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" })) as { DB_URL?: string })
    .DB_URL;
  if (!statusDbUrl) throw new Error("`supabase status` gave no DB URL: is `npx supabase start` running?");
  return statusDbUrl;
}

/**
 * Runs SQL as the database owner against the local stack, for what no API
 * can do: the Discord and Google identities of #106 come only from a real
 * OAuth round trip, so the tests insert them into auth.identities directly.
 * Needs `psql`; the URL comes from SUPABASE_TEST_DB_URL, else `supabase status`.
 */
export function ownerSql(query: string): string {
  const url = ownerDbUrl();
  return execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-At", "-c", query], { encoding: "utf8" }).trim();
}
