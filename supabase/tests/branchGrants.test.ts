/**
 * Preview branches (#107) are created without Supabase's default privileges
 * on `public`: a table a migration creates is out of reach of `service_role`,
 * `anon` and `authenticated` until a migration grants it. Production and the
 * local stack still have those defaults, so a missing grant passes every other
 * test and only breaks a pull request's preview. `/api` works as the service
 * role, so it needs select, insert, update and delete on every table in
 * `public`: granted table by table, on all tables at once, or by the default
 * privileges that cover every table created after them. Read from the SQL
 * files, in the order Supabase applies them; needs no database.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SERVICE_ROLE = "service_role";
const NEEDED = ["select", "insert", "update", "delete"];
const DEFAULTS = /^alter default privileges (?:for (?:role|user) [\w", ]+ )?in schema public grant (.+) on tables to (.+)$/;

const migrationsDir = join(import.meta.dirname, "..", "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"));

/**
 * The statements of some SQL, lower-cased with whitespace collapsed. A
 * `do $$ … $$` block is replaced by the statements its `execute '…'` calls
 * run (a grant made only when its table exists still counts for that table).
 */
function statementsOf(sql: string): string[] {
  const executed: string[] = [];
  const outsideBlocks = sql
    .replace(/--.*$/gm, "")
    .replace(/\bdo\s+\$(\w*)\$([\s\S]*?)\$\1\$/gi, (_block, _tag, body: string) => {
      for (const m of body.matchAll(/\bexecute\s+'((?:[^']|'')*)'/gi)) executed.push(m[1].replace(/''/g, "'"));
      return "";
    });
  return [...outsideBlocks.split(";"), ...executed]
    .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
    .filter((statement) => statement !== "");
}

/** `profiles`, `public.profiles` and `"public"."profiles"` all name `public.profiles`. */
function tableName(name: string): string {
  const unquoted = name.replace(/"/g, "").trim();
  return unquoted.includes(".") ? unquoted : `public.${unquoted}`;
}

/** True when a privilege list (`select, insert, …`, `all`, `all privileges`) holds all four the service role needs. */
function coversNeeded(privileges: string): boolean {
  const listed = privileges.split(",").map((p) => p.trim());
  return listed.includes("all") || listed.includes("all privileges") || NEEDED.every((p) => listed.includes(p));
}

function namesServiceRole(roles: string): boolean {
  return roles
    .replace(/ with grant option$/, "")
    .split(",")
    .some((role) => role.trim() === SERVICE_ROLE);
}

/** True when a statement sets default privileges giving the service role all four on new tables in `public`. */
function isServiceRoleDefaults(statement: string): boolean {
  const m = DEFAULTS.exec(statement);
  return m !== null && coversNeeded(m[1]) && namesServiceRole(m[2]);
}

/** The `public` tables the service role cannot fully use, after every migration in order. */
function ungrantedTables(sqlFiles: string[]): string[] {
  const tables: string[] = [];
  const granted = new Set<string>();
  let defaultsCoverNewTables = false;
  for (const statement of sqlFiles.flatMap(statementsOf)) {
    const created = /^create (?:unlogged )?table (?:if not exists )?([\w."]+)/.exec(statement);
    if (created) {
      const name = tableName(created[1]);
      if (!name.startsWith("public.")) continue;
      if (!tables.includes(name)) tables.push(name);
      if (defaultsCoverNewTables) granted.add(name);
      continue;
    }
    if (isServiceRoleDefaults(statement)) {
      defaultsCoverNewTables = true;
      continue;
    }
    const grant = /^grant (.+?) on (.+) to (.+)$/.exec(statement);
    if (!grant || !coversNeeded(grant[1]) || !namesServiceRole(grant[3])) continue;
    const target = grant[2].trim();
    if (target === "all tables in schema public") {
      for (const table of tables) granted.add(table);
    } else if (!/^(function|functions|procedure|routine|sequence|schema|database|all )/.test(target)) {
      for (const name of target.replace(/^table /, "").split(",")) granted.add(tableName(name));
    }
  }
  return tables.filter((table) => !granted.has(table));
}

function hasServiceRoleDefaults(sqlFiles: string[]): boolean {
  return sqlFiles.flatMap(statementsOf).some(isServiceRoleDefaults);
}

describe("reading grants from migrations", () => {
  it("finds tables created with if not exists, unqualified or quoted", () => {
    expect(ungrantedTables(['create table if not exists a (id int); create table b (id int); create table "public"."c" (id int);'])).toEqual([
      "public.a",
      "public.b",
      "public.c",
    ]);
  });

  it("ignores tables outside public", () => {
    expect(ungrantedTables(["create table private.secrets (id int);"])).toEqual([]);
  });

  it("needs all four privileges, in any form", () => {
    const create = "create table public.t (id int);";
    expect(ungrantedTables([create, "grant select, insert, update on table public.t to service_role;"])).toEqual(["public.t"]);
    expect(ungrantedTables([create, "grant select, insert, update, delete on table public.t to service_role;"])).toEqual([]);
    expect(ungrantedTables([create, "grant all on public.t to service_role;"])).toEqual([]);
    expect(ungrantedTables([create, "grant all privileges on table t to anon, service_role;"])).toEqual([]);
  });

  it("needs the grant to name the service role", () => {
    expect(ungrantedTables(["create table t (id int);", "grant all on t to anon, authenticated;"])).toEqual(["public.t"]);
  });

  it("accepts a grant without `table`, and one on all tables, for the tables that exist by then", () => {
    expect(ungrantedTables(["create table t (id int);", "grant select, insert, update, delete on t to service_role;"])).toEqual([]);
    expect(
      ungrantedTables(["create table t (id int);", "grant all on all tables in schema public to service_role;", "create table later (id int);"]),
    ).toEqual(["public.later"]);
  });

  it("counts default privileges for the tables created after them, and only with all four", () => {
    const defaults = "alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role;";
    expect(ungrantedTables(["create table before (id int);", defaults, "create table after (id int);"])).toEqual(["public.before"]);
    expect(hasServiceRoleDefaults([defaults])).toBe(true);
    expect(hasServiceRoleDefaults(["alter default privileges in schema public grant all on tables to service_role;"])).toBe(true);
    expect(hasServiceRoleDefaults(["alter default privileges in schema public grant select on tables to service_role;"])).toBe(false);
  });

  it("counts a grant run from a do block, and ignores the semicolons inside it", () => {
    const block = `do $$ begin
      if to_regclass('public.t') is not null then
        execute 'grant select, insert, update, delete on public.t to service_role';
      end if;
    end $$;`;
    expect(ungrantedTables(["create table t (id int);", block])).toEqual([]);
  });

  it("ignores comments", () => {
    expect(ungrantedTables(["create table t (id int);", "-- grant all on t to service_role;"])).toEqual(["public.t"]);
  });
});

describe("table grants for preview branches (#107)", () => {
  it("finds the tables the migrations create", () => {
    expect(ungrantedTables(migrations.map((sql) => sql.replace(/\bgrant\b[^;]*;/gi, "")))).toEqual(
      expect.arrayContaining(["public.profiles", "public.rooms", "public.matches", "public.moves"]),
    );
  });

  it("gives the service role all four privileges on every table, so /api works on a branch", () => {
    expect(ungrantedTables(migrations)).toEqual([]);
  });

  it("gives the service role default privileges, so a table a later migration creates is covered on a branch", () => {
    expect(hasServiceRoleDefaults(migrations)).toBe(true);
  });
});
