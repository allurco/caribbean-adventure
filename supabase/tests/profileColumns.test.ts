/**
 * Deleting an account (#108) must clear everything personal about the
 * player, so `public.anonymise_profile` names every column of
 * `public.profiles` (those it keeps, ids and timestamps, and those it clears)
 * and every table that references a profile (those whose rows it keeps, the
 * match records, and those whose rows it deletes, such as the sign-in
 * providers of #106). This reads the migrations, with no database, so
 * `npm test` fails as soon as a migration adds a column or a referencing
 * table the anonymiser does not name: the always-run backstop. The function
 * also refuses to run on either, and `deleteAccount.rls.test.ts` checks the
 * live catalog (`pg_constraint`, `information_schema`), so a deletion never
 * leaves one behind.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { anonymiserColumns, deletedProfileGuard, newUserAvatar, profileColumns, profileReferences } from "./profileColumns";

const MIGRATIONS = new URL("../migrations/", import.meta.url);
const migrations = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(new URL(name, MIGRATIONS), "utf8"));

describe("the profile's columns and the anonymiser", () => {
  it("reads a table's columns from its create, and later adds, drops and renames", () => {
    const sql = [
      `create table public.profiles (
        id uuid primary key references auth.users (id) on delete cascade,
        display_name text not null
          constraint profiles_display_name_check check (char_length(display_name) between 1 and 32),
        avatar_url text,
        created_at timestamptz not null default now(),
        constraint profiles_extra check (true)
      );`,
      `alter table public.profiles add column provider text, add column if not exists provider_id text;`,
      `alter table public.profiles drop column if exists provider;`,
      `alter table public.profiles rename column avatar_url to picture_url;`,
      `alter table public.rooms add column ignored text;`,
    ];
    expect(profileColumns(sql).sort()).toEqual(["created_at", "display_name", "id", "picture_url", "provider_id"]);
  });

  it("reads the anonymiser's kept and cleared columns from its latest definition", () => {
    const fn = (kept: string, cleared: string) => `
      create or replace function public.anonymise_profile(p_user uuid)
      returns void language plpgsql as $$
      declare
        v_kept constant text[] := array[${kept}];
        v_cleared constant text[] := array[${cleared}];
      begin
        update public.profiles set display_name = 'Deleted player', avatar_url = null where id = p_user;
      end;
      $$;`;
    expect(anonymiserColumns([fn("'id'", "'display_name'"), fn("'id', 'created_at'", "'display_name', 'avatar_url'")])).toMatchObject({
      kept: ["id", "created_at"],
      cleared: ["display_name", "avatar_url"],
      set: ["display_name", "avatar_url"],
    });
  });

  it("names every column of public.profiles, as kept or cleared, and none twice", () => {
    const { kept, cleared } = anonymiserColumns(migrations);
    expect(kept.filter((c) => cleared.includes(c))).toEqual([]);
    expect([...kept, ...cleared].sort()).toEqual(profileColumns(migrations).sort());
  });

  it("writes every column it clears", () => {
    const { cleared, set } = anonymiserColumns(migrations);
    expect(cleared.filter((column) => !set.includes(column))).toEqual([]);
  });

  it("keeps no more than the id, the timestamps and the deletion mark", () => {
    expect(anonymiserColumns(migrations).kept.sort()).toEqual(["created_at", "deleted_at", "id", "updated_at"]);
  });

  it("holds every cleared column on a deleted profile, whatever writes it later", () => {
    const { cleared } = anonymiserColumns(migrations);
    expect(deletedProfileGuard(migrations).sort()).toEqual([...cleared, "deleted_at"].sort());
  });
});

describe("the tables that reference a profile, and the anonymiser", () => {
  it("reads the tables that reference public.profiles, from creates and later alters", () => {
    const sql = [
      `create table public.seats (
        room_id uuid not null references public.rooms (id) on delete cascade,
        user_id uuid not null references auth.users (id) on delete cascade
      );`,
      `create table public.badges (owner uuid references public.profiles (id), name text);`,
      `create table if not exists public.notes (
        id bigint primary key,
        author uuid,
        constraint notes_author_fkey foreign key (author) references public.profiles(id)
      );`,
      `alter table public.seats
        drop constraint seats_user_id_fkey,
        add constraint seats_user_id_fkey foreign key (user_id) references public.profiles (id) on delete restrict;`,
      `alter table public.rooms add constraint rooms_x check (true);`,
    ];
    expect(profileReferences(sql).sort()).toEqual(["public.badges", "public.notes", "public.seats"]);
  });

  it("reads the anonymiser's kept and cleared tables", () => {
    const fn = `
      create function public.anonymise_profile(p_user uuid) returns void language plpgsql as $$
      declare
        v_kept constant text[] := array['id'];
        v_cleared constant text[] := array['display_name'];
        v_kept_tables constant text[] := array['public.seats', 'public.rooms'];
        v_cleared_tables constant text[] := array['public.profile_identities'];
      begin
        update public.profiles set display_name = 'Deleted player' where id = p_user;
      end;
      $$;`;
    expect(anonymiserColumns([fn])).toMatchObject({ keptTables: ["public.seats", "public.rooms"], clearedTables: ["public.profile_identities"] });
  });

  it("names every table that references a profile, as kept or cleared", () => {
    const { keptTables, clearedTables } = anonymiserColumns(migrations);
    const named = [...keptTables, ...clearedTables];
    expect(profileReferences(migrations).filter((table) => !named.includes(table))).toEqual([]);
  });

  it("keeps only the match records: the seats, the rooms' hosts and the move log", () => {
    expect(anonymiserColumns(migrations).keptTables.sort()).toEqual(["public.moves", "public.rooms", "public.seats"]);
  });

  it("clears the sign-in providers (#106) whether or not their table exists yet", () => {
    expect(anonymiserColumns(migrations).clearedTables).toContain("public.profile_identities");
  });
});

describe("the sign-up trigger's avatar (#106)", () => {
  // #106 takes a new profile's avatar only from Discord or Google, so an
  // email sign-up cannot choose its own picture; #108 redefines
  // handle_new_user after it, and must keep that.
  it("reads the expression the latest handle_new_user inserts as the avatar", () => {
    const fn = (avatar: string) => `
      create or replace function public.handle_new_user() returns trigger language plpgsql as $$
      begin
        insert into public.profiles (id, display_name, avatar_url)
        values (new.id, case when true then 'x' end, ${avatar})
        on conflict (id) do nothing;
        return new;
      end;
      $$;`;
    expect(newUserAvatar([fn("null"), fn("case when ok(a, b) then a end")])).toBe("case when ok(a, b) then a end");
  });

  it("takes the avatar only from a Discord or Google sign-up", () => {
    expect(newUserAvatar(migrations)).toMatch(/new\.raw_app_meta_data\s*->>\s*'provider'\s+in\s*\(\s*'discord'\s*,\s*'google'\s*\)/i);
  });
});
