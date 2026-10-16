/**
 * Discord and Google on the profile (#106): `public.profile_identities` and
 * the trigger on `auth.identities`, against a local Supabase (`npx supabase
 * start`; see `localStack.ts`). Skipped unless SUPABASE_DB_TESTS=1; run with
 * `npm run test:db`. An OAuth identity only comes from a real provider round
 * trip, so these insert it as Supabase Auth would, with `psql`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dbTestsEnabled, localStack, NO_SESSION, ownerSql, testPlayers, type LocalStack } from "./localStack";

/** A Discord avatar as Supabase Auth builds it: the player's Discord user ID, then the picture's hash. */
function discordAvatar(discordId: string, hash = "a"): string {
  return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.png`;
}

/** A provider ID no other test run uses. */
function providerId(): string {
  return String(BigInt(`0x${randomUUID().replace(/-/g, "").slice(0, 15)}`));
}

function literal(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/** Links an identity to the user, as Supabase Auth does on an OAuth sign-in or an automatic link. */
function linkIdentity(userId: string, provider: string, id: string, data: Record<string, string>): void {
  ownerSql(
    `insert into auth.identities (user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
     values (${literal(userId)}, ${literal(provider)}, ${literal(id)}, ${literal(JSON.stringify(data))}::jsonb, now(), now(), now())`,
  );
}

/** A later sign-in through the same identity, which refreshes its data. */
function refreshIdentity(provider: string, id: string, data: Record<string, string>): void {
  ownerSql(
    `update auth.identities set identity_data = ${literal(JSON.stringify(data))}::jsonb
     where provider = ${literal(provider)} and provider_id = ${literal(id)}`,
  );
}

describe.skipIf(!dbTestsEnabled)("profile_identities (local Supabase)", () => {
  let stack: LocalStack;
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  const players = testPlayers(() => stack, () => admin);

  async function profile(id: string): Promise<{ display_name: string; avatar_url: string | null }> {
    const { data } = await admin.from("profiles").select("display_name, avatar_url").eq("id", id).single();
    return data as { display_name: string; avatar_url: string | null };
  }

  beforeAll(() => {
    stack = localStack();
    admin = createClient(stack.url, stack.serviceKey, NO_SESSION);
    anon = createClient(stack.url, stack.anonKey, NO_SESSION);
  });

  afterAll(async () => {
    await players.deleteAll();
  });

  it("records a Discord ID on the profile of the player it signs in to", async () => {
    const anne = await players.create();
    const discord = providerId();
    linkIdentity(anne.id, "discord", discord, { full_name: "Anne Bonny", avatar_url: discordAvatar(discord) });
    const { data, error } = await anne.client.from("profile_identities").select("provider, provider_id, profile_id");
    expect(error).toBeNull();
    expect(data).toEqual([{ provider: "discord", provider_id: discord, profile_id: anne.id }]);
  });

  it("fills an email player's placeholder name and empty avatar from the provider they link", async () => {
    const anne = await players.create();
    expect((await profile(anne.id)).avatar_url).toBeNull();
    const discord = providerId();
    linkIdentity(anne.id, "discord", discord, { full_name: "Anne Bonny", avatar_url: discordAvatar(discord) });
    expect(await profile(anne.id)).toEqual({ display_name: "Anne Bonny", avatar_url: discordAvatar(discord) });
  });

  it("keeps a name the player chose, and the avatar the first provider gave", async () => {
    const mary = await players.create();
    await mary.client.from("profiles").update({ display_name: "Mary Read" }).eq("id", mary.id);
    linkIdentity(mary.id, "google", providerId(), { full_name: "M R", picture: "https://lh3.googleusercontent.com/m" });
    const discord = providerId();
    linkIdentity(mary.id, "discord", discord, { full_name: "Other", avatar_url: discordAvatar(discord) });
    expect(await profile(mary.id)).toEqual({ display_name: "Mary Read", avatar_url: "https://lh3.googleusercontent.com/m" });
  });

  it("follows the provider's new avatar on a later sign-in", async () => {
    const jack = await players.create();
    const discord = providerId();
    linkIdentity(jack.id, "discord", discord, { avatar_url: discordAvatar(discord) });
    const changed = discordAvatar(discord, "b");
    refreshIdentity("discord", discord, { avatar_url: changed });
    expect((await profile(jack.id)).avatar_url).toBe(changed);
  });

  it("never fails a sign-in over hostile identity data, and stores none of it", async () => {
    const eve = await players.create();
    const before = await profile(eve.id);
    linkIdentity(eve.id, "discord", "not a snowflake ' --", { full_name: "\u0007", avatar_url: "javascript:alert(1)" });
    const { data } = await eve.client.from("profile_identities").select("provider_id");
    expect(data).toEqual([]);
    expect(await profile(eve.id)).toEqual(before);
  });

  it("shows a player's providers to nobody else, signed in or not", async () => {
    const anne = await players.create();
    const jack = await players.create();
    linkIdentity(anne.id, "google", providerId(), {});
    const byJack = await jack.client.from("profile_identities").select("provider_id").eq("profile_id", anne.id);
    expect(byJack.data ?? []).toEqual([]);
    const byAnon = await anon.from("profile_identities").select("provider_id").eq("profile_id", anne.id);
    expect(byAnon.data ?? []).toEqual([]);
  });

  it("lets no client write a provider ID, even their own", async () => {
    const anne = await players.create();
    const discord = providerId();
    linkIdentity(anne.id, "discord", discord, {});
    const insert = await anne.client.from("profile_identities").insert({ provider: "google", provider_id: "1", profile_id: anne.id });
    expect(insert.error).not.toBeNull();
    const update = await anne.client.from("profile_identities").update({ provider_id: "2" }).eq("profile_id", anne.id);
    expect(update.error).not.toBeNull();
    const remove = await anne.client.from("profile_identities").delete().eq("profile_id", anne.id);
    expect(remove.error).not.toBeNull();
    const { data } = await anne.client.from("profile_identities").select("provider_id");
    expect(data).toEqual([{ provider_id: discord }]);
  });

  it("drops the row when the identity is unlinked", async () => {
    const anne = await players.create();
    const discord = providerId();
    linkIdentity(anne.id, "discord", discord, {});
    ownerSql(`delete from auth.identities where provider = 'discord' and provider_id = ${literal(discord)}`);
    const { data } = await anne.client.from("profile_identities").select("provider_id");
    expect(data).toEqual([]);
  });

  it("publishes a Discord player's ID only inside their avatar URL, as documented", async () => {
    const anne = await players.create();
    const discord = providerId();
    linkIdentity(anne.id, "discord", discord, { full_name: "Anne Bonny", avatar_url: discordAvatar(discord) });
    const { data } = await anon.from("profiles").select("*").eq("id", anne.id).single();
    const row = data as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["avatar_url", "created_at", "display_name", "id", "updated_at"]);
    // The avatar is public, and Discord's avatar URL carries the user ID (docs/deploy.md, the migration's comment).
    expect(row.avatar_url).toBe(discordAvatar(discord));
    const elsewhere = Object.entries(row).filter(([column]) => column !== "avatar_url");
    expect(JSON.stringify(elsewhere)).not.toContain(discord);
    // Which provider account signs in to the profile stays private.
    const byAnon = await anon.from("profile_identities").select("provider_id").eq("profile_id", anne.id);
    expect(byAnon.data ?? []).toEqual([]);
  });

  it("lets no player set their own avatar: it comes only from a provider", async () => {
    const anne = await players.create();
    const discord = providerId();
    linkIdentity(anne.id, "discord", discord, { avatar_url: discordAvatar(discord) });
    const set = await anne.client.from("profiles").update({ avatar_url: "https://lh3.googleusercontent.com/mine" }).eq("id", anne.id);
    expect(set.error).not.toBeNull();
    const cleared = await anne.client.from("profiles").update({ avatar_url: null }).eq("id", anne.id);
    expect(cleared.error).not.toBeNull();
    expect((await profile(anne.id)).avatar_url).toBe(discordAvatar(discord));
  });
});
