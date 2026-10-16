import { describe, expect, it } from "vitest";
import { isAccountGone } from "./onlineStore";
import { storeError } from "./supabaseOnlineStore";

// How the Supabase store reports a database error (#108): the two that mean
// the account is deleted become `accountGone()`, for /api to answer 401.
describe("storeError", () => {
  it("reads the deleted profile's refusal (require_live_profile) as a deleted account", () => {
    expect(isAccountGone(storeError({ code: "28000", message: "the account is deleted" }))).toBe(true);
  });

  it("reads a rate counter for a deleted auth user as a deleted account", () => {
    const fk = {
      code: "23503",
      message: 'insert or update on table "rate_counters" violates foreign key constraint "rate_counters_user_id_fkey"',
    };
    expect(isAccountGone(storeError(fk))).toBe(true);
  });

  it("keeps any other error as it is, foreign keys included", () => {
    const other = storeError({ code: "23503", message: 'insert or update on table "seats" violates foreign key constraint "seats_room_id_fkey"' });
    expect(isAccountGone(other)).toBe(false);
    expect(other.message).toContain("seats_room_id_fkey");
    expect(isAccountGone(storeError({ message: "network down" }))).toBe(false);
  });
});
