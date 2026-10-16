/**
 * Row-level security of `public.profiles` (#105), against a local Supabase
 * (`npx supabase start`, which needs Docker; see `localStack.ts`). Skipped
 * unless SUPABASE_DB_TESTS=1, so `npm test` and CI never need a database;
 * run them with `npm run test:db`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dbTestsEnabled, localStack, NO_SESSION, testPlayers, type LocalStack } from "./localStack";
import { randomUUID } from "node:crypto";

describe.skipIf(!dbTestsEnabled)("profiles row-level security (local Supabase)", () => {
  let stack: LocalStack;
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  const players = testPlayers(() => stack, () => admin);
  const newPlayer = (userMetadata?: Record<string, string>) => players.create(userMetadata);

  async function nameOf(id: string): Promise<string | undefined> {
    const { data } = await admin.from("profiles").select("display_name").eq("id", id).maybeSingle();
    return (data as { display_name: string } | null)?.display_name;
  }

  beforeAll(() => {
    stack = localStack();
    admin = createClient(stack.url, stack.serviceKey, NO_SESSION);
    anon = createClient(stack.url, stack.anonKey, NO_SESSION);
  });

  afterAll(async () => {
    await players.deleteAll();
  });

  it("creates a profile when a player signs up, with a placeholder name and no email in it", async () => {
    const anne = await newPlayer();
    const { data, error } = await admin.from("profiles").select("*").eq("id", anne.id).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: anne.id, avatar_url: null });
    expect(data.display_name).toBe(`Captain ${anne.id.replace(/-/g, "").slice(0, 6)}`);
    expect(data.display_name).not.toContain("@");
  });

  it("takes the name and avatar from the sign-in provider's metadata", async () => {
    const mary = await newPlayer({ full_name: "Mary Read", avatar_url: "https://cdn.example/m.png", provider_id: "1234" });
    const { data } = await admin.from("profiles").select("*").eq("id", mary.id).single();
    expect(data).toMatchObject({ display_name: "Mary Read", avatar_url: "https://cdn.example/m.png" });
  });

  it("cleans hostile sign-up metadata instead of storing it or failing the sign-up", async () => {
    const eve = await newPlayer({ full_name: "  Eve\u0007\n  the\tPirate  ", avatar_url: "javascript:alert(1)" });
    const { data } = await admin.from("profiles").select("*").eq("id", eve.id).single();
    expect(data).toMatchObject({ display_name: "Eve the Pirate", avatar_url: null });
    const http = await newPlayer({ avatar_url: "http://cdn.example/a.png" });
    expect((await admin.from("profiles").select("avatar_url").eq("id", http.id).single()).data?.avatar_url).toBeNull();
  });

  it("exposes only public columns: nothing from auth.users but the id", async () => {
    const mary = await newPlayer({ full_name: "Mary Read", provider_id: "1234" });
    const { data, error } = await anon.from("profiles").select("*").eq("id", mary.id).single();
    expect(error).toBeNull();
    expect(Object.keys(data ?? {}).sort()).toEqual(["avatar_url", "created_at", "display_name", "id", "updated_at"]);
    expect(JSON.stringify(data)).not.toContain("1234");
    expect(JSON.stringify(data)).not.toContain("@example.test");
  });

  it("lets anyone read a profile, signed in or not", async () => {
    const anne = await newPlayer();
    const other = await newPlayer();
    const byAnon = await anon.from("profiles").select("id, display_name").eq("id", anne.id).single();
    expect(byAnon.error).toBeNull();
    expect(byAnon.data?.id).toBe(anne.id);
    const byOther = await other.client.from("profiles").select("id").eq("id", anne.id).single();
    expect(byOther.data?.id).toBe(anne.id);
  });

  it("lets a player change their own display name", async () => {
    const anne = await newPlayer();
    const { data, error } = await anne.client
      .from("profiles")
      .update({ display_name: "Anne Bonny" })
      .eq("id", anne.id)
      .select("display_name")
      .single();
    expect(error).toBeNull();
    expect(data?.display_name).toBe("Anne Bonny");
  });

  it("changes nothing when a player edits someone else's profile", async () => {
    const anne = await newPlayer();
    const jack = await newPlayer();
    const before = await nameOf(anne.id);
    const { data } = await jack.client.from("profiles").update({ display_name: "Hijacked" }).eq("id", anne.id).select();
    expect(data ?? []).toEqual([]);
    expect(await nameOf(anne.id)).toBe(before);
  });

  it("refuses edits from a signed-out visitor", async () => {
    const anne = await newPlayer();
    const before = await nameOf(anne.id);
    const { data } = await anon.from("profiles").update({ display_name: "Vandal" }).eq("id", anne.id).select();
    expect(data ?? []).toEqual([]);
    expect(await nameOf(anne.id)).toBe(before);
  });

  it("does not let a player change their profile's id", async () => {
    const anne = await newPlayer();
    const { error } = await anne.client.from("profiles").update({ id: randomUUID() }).eq("id", anne.id);
    expect(error).not.toBeNull();
    expect(await nameOf(anne.id)).toBeDefined();
  });

  it("does not let a player create a profile, for themselves or anyone else", async () => {
    const anne = await newPlayer();
    const ghost = await anne.client.from("profiles").insert({ id: randomUUID(), display_name: "Ghost" });
    expect(ghost.error).not.toBeNull();
    const own = await anne.client.from("profiles").upsert({ id: anne.id, display_name: "Twin" });
    expect(own.error).not.toBeNull();
  });

  it("accepts only an https avatar URL, at most 2048 characters", async () => {
    // Players cannot write the avatar (#106: only the sign-in triggers do), so the check is tried as the service role.
    const anne = await newPlayer();
    const set = (avatar_url: string | null) => admin.from("profiles").update({ avatar_url }).eq("id", anne.id);
    expect((await set("https://cdn.example/a.png")).error).toBeNull();
    expect((await set(null)).error).toBeNull();
    for (const bad of [
      "javascript:alert(1)",
      "http://cdn.example/a.png",
      "data:image/png;base64,AAAA",
      "https://cdn.example/a b.png",
      "https://cdn.example/" + "a".repeat(2048),
    ]) {
      expect((await set(bad)).error, bad.slice(0, 40)).not.toBeNull();
    }
  });

  it("does not let a player delete a profile, even their own", async () => {
    const anne = await newPlayer();
    await anne.client.from("profiles").delete().eq("id", anne.id);
    expect(await nameOf(anne.id)).toBeDefined();
  });

  it("holds display names to 1–32 trimmed characters with no control characters", async () => {
    const anne = await newPlayer();
    for (const bad of ["", " padded ", "x".repeat(33), "Black\u0007beard", "Black\nbeard"]) {
      const { error } = await anne.client.from("profiles").update({ display_name: bad }).eq("id", anne.id);
      expect(error, JSON.stringify(bad)).not.toBeNull();
    }
  });
});
