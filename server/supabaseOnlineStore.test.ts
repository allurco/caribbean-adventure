import { describe, expect, it } from "vitest";
import { isAccountGone } from "./onlineStore";
import { storeError, supabaseAuthVerifier, type ServiceClient } from "./supabaseOnlineStore";

// How the Supabase store reports a database error (#108): the database's own
// refusal of a deleted account, SQLSTATE 28000 (`require_live_profile`, and
// `consume_rate_limit` for an auth user gone since the token was checked),
// becomes `accountGone()`, for /api to answer 401 `account_deleted`.
describe("storeError", () => {
  it("reads the database's deleted-account refusal (SQLSTATE 28000) as a deleted account", () => {
    expect(isAccountGone(storeError({ code: "28000", message: "the account is deleted" }))).toBe(true);
  });

  it("keeps any other error as it is, foreign keys included, whatever their text names", () => {
    const fk = {
      code: "23503",
      message: 'insert or update on table "rate_counters" violates foreign key constraint "rate_counters_user_id_fkey"',
    };
    expect(isAccountGone(storeError(fk))).toBe(false);
    const other = storeError({ code: "23503", message: 'insert or update on table "seats" violates foreign key constraint "seats_room_id_fkey"' });
    expect(isAccountGone(other)).toBe(false);
    expect(other.message).toContain("seats_room_id_fkey");
    expect(isAccountGone(storeError({ message: "network down" }))).toBe(false);
  });
});

// The sign-in check over Supabase Auth's `getUser`, with a fake client.
describe("supabaseAuthVerifier", () => {
  type GetUserAnswer = { data: { user: { id: string } | null }; error: { code?: string; status?: number; message: string } | null };
  const verifier = (answer: GetUserAnswer) =>
    supabaseAuthVerifier(async () => ({ auth: { getUser: async () => answer } }) as unknown as ServiceClient);

  it("gives the token's user", async () => {
    expect(await verifier({ data: { user: { id: "u1" } }, error: null })("tok")).toBe("u1");
  });

  it("reads a sound token whose user no longer exists as a deleted account", async () => {
    const check = verifier({ data: { user: null }, error: { code: "user_not_found", status: 403, message: "User from sub claim in JWT does not exist" } });
    const thrown = await check("tok").then(
      () => null,
      (error: unknown) => error,
    );
    expect(isAccountGone(thrown)).toBe(true);
  });

  it("is null for a bad or expired token, or when Auth cannot answer", async () => {
    expect(await verifier({ data: { user: null }, error: { code: "bad_jwt", status: 403, message: "invalid JWT" } })("tok")).toBeNull();
    expect(await verifier({ data: { user: null }, error: { status: 500, message: "upstream down" } })("tok")).toBeNull();
    expect(await verifier({ data: { user: null }, error: null })("tok")).toBeNull();
  });
});
