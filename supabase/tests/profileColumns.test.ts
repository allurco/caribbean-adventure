/**
 * Deleting an account (#108) must clear everything personal on the profile,
 * so `public.anonymise_profile` names every column of `public.profiles`:
 * those it keeps (ids and timestamps) and those it clears. This reads the
 * migrations, with no database, so `npm test` fails as soon as a migration
 * gives `profiles` a column (a provider's id, #106) the anonymiser does not
 * name. The function also refuses to run on such a column (the database
 * tests hold that), so a deletion never leaves one behind.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { anonymiserColumns, profileColumns } from "./profileColumns";

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
    expect(anonymiserColumns([fn("'id'", "'display_name'"), fn("'id', 'created_at'", "'display_name', 'avatar_url'")])).toEqual({
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
});
