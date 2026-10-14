/**
 * The one Supabase client of the page (#105), created on first use. It is
 * loaded with a dynamic import, so supabase-js is its own chunk and a build
 * with no backend configured never fetches it.
 */
import type { AccountClient } from "./accountClient";
import { readSupabaseConfig, type SupabaseConfig } from "./supabaseConfig";

/** The backend this build talks to, or null for the local hotseat game alone. */
export const supabaseConfig: SupabaseConfig | null = readSupabaseConfig(import.meta.env);

let client: Promise<AccountClient> | undefined;

export function getAccountClient(config: SupabaseConfig): Promise<AccountClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) => {
    const supabase = createClient(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    // Typed as the narrow port: these assignments check that the real client
    // still has the shape the account code and its fakes assume.
    const auth: AccountClient["auth"] = supabase.auth;
    const port: AccountClient = {
      auth,
      // Spelled out call by call: supabase-js' own query types are too deep
      // for TypeScript to compare with the port in one go.
      from: (table) => ({
        select: (columns) => ({
          eq: (column, value) => ({
            maybeSingle: () => supabase.from(table).select(columns).eq(column, value).maybeSingle(),
          }),
        }),
        update: (values) => ({
          eq: (column, value) => ({
            select: (columns) => ({
              maybeSingle: () => supabase.from(table).update(values).eq(column, value).select(columns).maybeSingle(),
            }),
          }),
        }),
      }),
    };
    return port;
  });
  return client;
}
