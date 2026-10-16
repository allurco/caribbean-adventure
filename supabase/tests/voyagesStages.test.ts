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
const latestListVoyages = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
  .filter((sql) => /create or replace function public\.list_voyages/i.test(sql))
  .at(-1);

describe("list_voyages and the combat stages", () => {
  it("projects a fight at every combat stage, and at no other", () => {
    expect(latestListVoyages).toBeDefined();
    const match = /->> 'stage'\) in \(([^)]*)\)/.exec(latestListVoyages!);
    expect(match).not.toBeNull();
    const stages = [...match![1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect([...stages].sort()).toEqual([...COMBAT_STAGES].sort());
  });
});
