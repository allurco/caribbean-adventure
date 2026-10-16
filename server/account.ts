/**
 * `POST /api/me/delete` (#108): the signed-in player deletes their own
 * account. Only the bearer token's user, never an id from the body.
 *
 * The profile is anonymised first, then the sign-in identity deleted: if the
 * second step fails, nothing personal is left and the player, still signed
 * in, can simply ask again (both steps are idempotent). The other way round,
 * a failure after the identity is gone would leave no one able to ask.
 */
import { fail, json } from "./http";
import type { OnlineStore } from "./onlineStore";

/** A few tries an hour: enough to retry a failure, too few to hammer Supabase Auth. */
export const ACCOUNT_DELETION_LIMIT = { action: "delete_account", limit: 5, windowSeconds: 60 * 60 } as const;

export async function deleteAccount(userId: string, store: OnlineStore): Promise<Response> {
  const { action, limit, windowSeconds } = ACCOUNT_DELETION_LIMIT;
  if (!(await store.consumeRateLimit(userId, action, limit, windowSeconds))) {
    return fail(429, "rate_limited", "too many tries: wait a while");
  }
  await store.anonymiseAccount(userId);
  await store.deleteSignIn(userId);
  return json({ ok: true });
}
