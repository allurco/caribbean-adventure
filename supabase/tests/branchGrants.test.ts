/**
 * Preview branches (#107) are created without Supabase's default privileges
 * on `public`: a table a migration creates is out of reach of `service_role`,
 * `anon` and `authenticated` until a migration grants it. Production and the
 * local stack still have those defaults, so a missing grant passes every other
 * test and only breaks a pull request's preview. `/api` works as the service
 * role, so every table must be granted to it explicitly. Read from the SQL
 * files; needs no database.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(import.meta.dirname, "..", "migrations");
const statements = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .flatMap((name) => stripComments(readFileSync(join(migrationsDir, name), "utf8")).split(";"))
  .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase());

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

const tables = statements.flatMap((s) => /^create table (public\.\w+)/.exec(s)?.[1] ?? []);

/** The tables a `grant … on table a, b to …, service_role` statement names. */
function grantedToServiceRole(statement: string): string[] {
  const m = /^grant (.+) on table (.+) to (.+)$/.exec(statement);
  if (!m || !m[3].split(",").some((role) => role.trim() === "service_role")) return [];
  return m[2].split(",").map((t) => t.trim());
}

describe("table grants for preview branches (#107)", () => {
  it("finds the tables the migrations create", () => {
    expect(tables).toEqual(expect.arrayContaining(["public.profiles", "public.rooms", "public.matches", "public.moves"]));
  });

  it("grants every table to the service role explicitly, so /api works on a branch", () => {
    const granted = new Set(statements.flatMap(grantedToServiceRole));
    expect(tables.filter((t) => !granted.has(t))).toEqual([]);
  });
});
