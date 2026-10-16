/**
 * The voyage list projects a fight only at a stage it knows (#347): the
 * stage list in the latest migration that defines `list_voyages` must be
 * every stage of `COMBAT_STAGES`, or a match waiting on a new step shows the
 * wrong seat's turn. Read from the SQL files, in the order Supabase applies
 * them; needs no database.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMBAT_STAGES } from "../../src/game/types";

const migrationsDir = join(import.meta.dirname, "..", "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"));

/** The last of `migrations` (in the order applied) to define `list_voyages`, by `create function` or `create or replace function`. */
function latestListVoyages(sqls: readonly string[]): string | undefined {
  return sqls.filter((sql) => /create (or replace )?function public\.list_voyages/i.test(sql)).at(-1);
}

/** The stages a `list_voyages` definition projects a fight at. */
function projectedStages(sql: string): string[] {
  const match = /->> 'stage'\) in \(([^)]*)\)/.exec(sql);
  if (!match) throw new Error("no stage list in list_voyages");
  return [...match[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
}

describe("list_voyages and the combat stages", () => {
  it("projects a fight at every combat stage, and at no other", () => {
    const latest = latestListVoyages(migrations);
    expect(latest).toBeDefined();
    expect([...projectedStages(latest!)].sort()).toEqual([...COMBAT_STAGES].sort());
  });

  it("reads a later migration that drops the function and creates it again, not only one that replaces it", () => {
    const replaced = "create or replace function public.list_voyages(p_user uuid) ... (combat ->> 'stage') in ('seamanship')";
    const recreated = "drop function public.list_voyages(uuid);\ncreate function public.list_voyages(p_user uuid) ... (combat ->> 'stage') in ('cannons')";
    expect(projectedStages(latestListVoyages([replaced, recreated])!)).toEqual(["cannons"]);
  });
});
