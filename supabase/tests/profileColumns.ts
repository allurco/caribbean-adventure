/**
 * Reads the migrations for `profileColumns.test.ts` (#108): the columns of
 * `public.profiles`, the tables that reference it, the columns and tables
 * `public.anonymise_profile` keeps, clears and writes, and the columns the
 * deleted-profile trigger holds. A small reader for the statements this
 * repo's migrations use, not a SQL parser.
 */

const NOT_A_COLUMN = new Set(["constraint", "primary", "unique", "check", "foreign", "exclude", "like"]);

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Splits on commas outside parentheses and quotes. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'") quoted = !quoted;
    else if (!quoted && c === "(") depth++;
    else if (!quoted && c === ")") depth--;
    else if (!quoted && depth === 0 && c === ",") {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** The text inside the parentheses that open at `open`. */
function parenthesised(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error("unbalanced parentheses");
}

/** The columns of `public.profiles` once every migration has run, in order. */
export function profileColumns(migrations: string[]): string[] {
  const columns: string[] = [];
  const sql = stripComments(migrations.join("\n"));
  const statement = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.profiles\s*\(|alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.profiles\s+([^;]*);/gi;
  for (let m = statement.exec(sql); m; m = statement.exec(sql)) {
    if (m[1] === undefined) {
      for (const part of splitTopLevel(parenthesised(sql, m.index + m[0].length - 1))) {
        const name = part.split(/\s+/)[0].toLowerCase();
        if (!NOT_A_COLUMN.has(name)) columns.push(name);
      }
      continue;
    }
    for (const action of splitTopLevel(m[1])) {
      const add = /^add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?(\w+)/i.exec(action);
      if (add && !NOT_A_COLUMN.has(add[1].toLowerCase())) columns.push(add[1].toLowerCase());
      const drop = /^drop\s+(?:column\s+)?(?:if\s+exists\s+)?(\w+)/i.exec(action);
      if (drop && drop[1].toLowerCase() !== "constraint") {
        const at = columns.indexOf(drop[1].toLowerCase());
        if (at >= 0) columns.splice(at, 1);
      }
      const rename = /^rename\s+(?:column\s+)?(\w+)\s+to\s+(\w+)/i.exec(action);
      if (rename && rename[1].toLowerCase() !== "constraint") {
        const at = columns.indexOf(rename[1].toLowerCase());
        if (at >= 0) columns[at] = rename[2].toLowerCase();
      }
    }
  }
  return columns;
}

function quotedList(body: string, variable: string, required = true): string[] {
  const m = new RegExp(`${variable}\\s+constant\\s+text\\[\\]\\s*:=\\s*array\\[([^\\]]*)\\]`, "i").exec(body);
  if (!m) {
    if (required) throw new Error(`anonymise_profile has no ${variable} list`);
    return [];
  }
  return [...m[1].matchAll(/'([\w.]+)'/g)].map((q) => q[1]);
}

/** The body (between the `$$`) of the latest definition of `public.<name>`. */
function latestFunctionBody(sql: string, name: string): string {
  const definitions = [...sql.matchAll(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, "gi"))];
  if (definitions.length === 0) throw new Error(`no public.${name} in the migrations`);
  const open = sql.indexOf("$$", definitions[definitions.length - 1].index);
  return sql.slice(open + 2, sql.indexOf("$$", open + 2));
}

/**
 * The tables with a foreign key to `public.profiles`, as `public.<table>`:
 * from a `create table` whose body references it, or an `alter table` that
 * adds such a constraint.
 */
export function profileReferences(migrations: string[]): string[] {
  const tables = new Set<string>();
  const sql = stripComments(migrations.join("\n"));
  const references = /references\s+public\.profiles\b/i;
  const statement = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(|alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.(\w+)\s+([^;]*);/gi;
  for (let m = statement.exec(sql); m; m = statement.exec(sql)) {
    const body = m[1] !== undefined ? parenthesised(sql, m.index + m[0].length - 1) : m[3];
    const table = (m[1] ?? m[2]).toLowerCase();
    if (table !== "profiles" && references.test(body)) tables.add(`public.${table}`);
  }
  return [...tables];
}

/** The columns `public.keep_deleted_profile_anonymous` sets on a deleted profile (`new.<column> :=`). */
export function deletedProfileGuard(migrations: string[]): string[] {
  const body = latestFunctionBody(stripComments(migrations.join("\n")), "keep_deleted_profile_anonymous");
  return [...new Set([...body.matchAll(/\bnew\.(\w+)\s*:=/gi)].map((m) => m[1].toLowerCase()))];
}

/**
 * The latest `public.anonymise_profile`: the columns it keeps, those it
 * clears, those its update writes, and the referencing tables whose rows it
 * keeps and those whose rows it deletes.
 */
export function anonymiserColumns(migrations: string[]): {
  kept: string[];
  cleared: string[];
  set: string[];
  keptTables: string[];
  clearedTables: string[];
} {
  const body = latestFunctionBody(stripComments(migrations.join("\n")), "anonymise_profile");
  const update = /update\s+public\.profiles\s+set\s+([\s\S]*?)\s+where\b/i.exec(body);
  if (!update) throw new Error("anonymise_profile does not update public.profiles");
  return {
    kept: quotedList(body, "v_kept"),
    cleared: quotedList(body, "v_cleared"),
    set: splitTopLevel(update[1]).map((assignment) => assignment.split("=")[0].trim().toLowerCase()),
    keptTables: quotedList(body, "v_kept_tables", false),
    clearedTables: quotedList(body, "v_cleared_tables", false),
  };
}

/** The value the latest `public.handle_new_user` inserts into `profiles.avatar_url`. */
export function newUserAvatar(migrations: string[]): string {
  const body = latestFunctionBody(stripComments(migrations.join("\n")), "handle_new_user");
  const insert = /insert\s+into\s+public\.profiles\s*\(([^)]*)\)\s*values\s*\(/i.exec(body);
  if (!insert) throw new Error("handle_new_user does not insert into public.profiles");
  const columns = insert[1].split(",").map((c) => c.trim().toLowerCase());
  const values = splitTopLevel(parenthesised(body, insert.index + insert[0].length - 1));
  const at = columns.indexOf("avatar_url");
  if (at < 0) throw new Error("handle_new_user does not insert an avatar_url");
  return values[at].replace(/\s+/g, " ").trim();
}
