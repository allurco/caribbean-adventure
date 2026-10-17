/**
 * The art manifest (docs/art/README.md) held to the code: the one list of
 * every 2D image the game needs, with its prompt, so generated art is never
 * lost. Every table line is a row that parses; every event card slot
 * (cardArtSlots.ts) and every image under public/ has a row; a row is
 * `wired` exactly when the code loads its file, and `in repo` or `wired`
 * exactly when its file is under public/; an event card's row names the file
 * CARD_ART names; every prompt link lands on a heading.
 * Type-checked by tsconfig.node.json, as it uses Node's fs.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { CARD_ART, CARD_ART_SLOTS } from "./cardArtSlots";
import { HARBOUR_STILL } from "../online/harbourStillImage";

const STATUSES = ["needed", "made", "in repo", "wired"] as const;
type Status = (typeof STATUSES)[number];

interface ManifestRow {
  slot: string;
  prompt: string;
  target: string;
  status: Status;
}

/** The manifest's slot rows, and every table line that is not one, so no row drops out unseen. */
interface ParsedManifest {
  rows: ManifestRow[];
  errors: string[];
}

const isStatus = (value: string): value is Status => (STATUSES as readonly string[]).includes(value);

/** The table's cells: slot, shows, prompt, style, size, target, status, wired by. */
const COLUMNS = 8;

const ROOT = new URL("../../", import.meta.url);
const PUBLIC_DIR = new URL("public/", ROOT);
const ART_DIR = new URL("docs/art/", ROOT);
const readText = (url: URL) => readFileSync(url, "utf8");

const IMAGE_FILE = /\.(png|jpe?g|webp|avif|gif|svg|ico)$/i;

/** The text inside the first pair of backticks, or null. */
function backticked(cell: string): string | null {
  return /`([^`]+)`/.exec(cell)?.[1] ?? null;
}

/**
 * Every slot row of the manifest's tables. Each table line other than a
 * header or its separator must be a row: eight cells, a backticked slot id,
 * a backticked target and a known status. Any other table line is an error,
 * never skipped.
 */
function parseManifest(markdown: string): ParsedManifest {
  const rows: ManifestRow[] = [];
  const errors: string[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[0] === "Slot" || cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    const slot = /^`([^`]+)`$/.exec(cells[0] ?? "")?.[1];
    const target = backticked(cells[5] ?? "");
    const status = cells[6] ?? "";
    if (cells.length !== COLUMNS) errors.push(`${cells.length} cells, not ${COLUMNS}: ${line}`);
    else if (!slot) errors.push(`no backticked slot: ${line}`);
    else if (!target) errors.push(`no backticked target: ${line}`);
    else if (!isStatus(status)) errors.push(`unknown status "${status}": ${line}`);
    else rows.push({ slot, prompt: cells[2], target, status });
  }
  return { rows, errors };
}

/** GitHub's anchor for a heading: lower case, punctuation dropped, spaces to hyphens. */
function headingAnchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
}

/** The anchors of a markdown file's headings, duplicates numbered as GitHub does. */
function headingAnchors(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const line of markdown.split("\n")) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line)?.[1];
    if (heading === undefined) continue;
    const base = headingAnchor(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

/** Every file under `dir`, as paths relative to it. */
function filesUnder(dir: URL, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`]
  );
}

/** Each event card slot's rows and the file CARD_ART names for each (null while not made): the face, and the flag mask of a card that flies one. */
function eventCardFiles(): Map<string, string | null> {
  return new Map(
    CARD_ART_SLOTS.flatMap((slot): [string, string | null][] => {
      const { file, flag } = CARD_ART[slot];
      return flag ? [[`event.${slot}`, file], [`event.${slot}.flag`, flag.mask]] : [[`event.${slot}`, file]];
    })
  );
}

/** The files the code loads from public/: the event cards' art and masks, the harbour still, and the icons index.html and the web manifest name. */
function wiredFiles(): Set<string> {
  const cardFiles = [...eventCardFiles().values()];
  const html = readText(new URL("index.html", ROOT));
  const htmlLinks = [...html.matchAll(/href="\/([^"]+)"/g)].map((match) => match[1]);
  const webManifest = JSON.parse(readText(new URL("manifest.webmanifest", PUBLIC_DIR))) as { icons: { src: string }[] };
  const manifestIcons = webManifest.icons.map((icon) => icon.src.replace(/^\//, ""));
  return new Set(
    [...cardFiles, HARBOUR_STILL.path, ...htmlLinks, ...manifestIcons].filter((file): file is string => !!file)
  );
}

const manifest = parseManifest(readText(new URL("README.md", ART_DIR)));
const rows = manifest.rows;
const bySlot = new Map(rows.map((row) => [row.slot, row]));
const slotsOf = (list: ManifestRow[]) => list.map((row) => row.slot);

const ROW = "| `event.storm` | A squall | [Storm](event-card-prompts.md#storm) | painterly event | 3:4 | `cards/storm.webp` | made | #247 |";

describe("the manifest's parser", () => {
  it("reads a slot row's id, prompt, target and status, and skips headers, separators and prose", () => {
    const sample = [
      "Some prose.",
      "| Slot | Shows | Prompt | Style | Size | Target | Status | Wired by |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ROW,
    ].join("\n");
    expect(parseManifest(sample)).toEqual({
      rows: [{ slot: "event.storm", prompt: "[Storm](event-card-prompts.md#storm)", target: "cards/storm.webp", status: "made" }],
      errors: [],
    });
  });

  it.each([
    ["no backticked slot", ROW.replace("`event.storm`", "event.storm")],
    ["a missing cell", ROW.replace(" #247 |", "")],
    ["an extra cell", `${ROW} extra |`],
    ["no backticked target", ROW.replace("`cards/storm.webp`", "cards/storm.webp")],
    ["an unknown status", ROW.replace("| made |", "| done |")],
  ])("reports a table line with %s instead of skipping it", (_, line) => {
    const parsed = parseManifest(line);
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toHaveLength(1);
  });

  it("numbers duplicate headings' anchors as GitHub does", () => {
    expect([...headingAnchors("## Card back (the secret orders)\n### True (found)\n### A\n### A")]).toEqual([
      "card-back-the-secret-orders",
      "true-found",
      "a",
      "a-1",
    ]);
  });
});

describe("the art manifest (docs/art/README.md)", () => {
  it("parses every table line as a row, each with a unique slot id", () => {
    expect(manifest.errors).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(slotsOf(rows)).size).toBe(rows.length);
  });

  it("lists every event card slot, and the flag mask of each card that flies one", () => {
    expect([...eventCardFiles().keys()].filter((slot) => !bySlot.has(slot))).toEqual([]);
  });

  it("names, for an event card slot, the file CARD_ART names once it names one", () => {
    const cardFiles = eventCardFiles();
    const mismatched = rows.filter((row) => {
      const file = cardFiles.get(row.slot);
      return file != null && file !== row.target;
    });
    expect(slotsOf(mismatched)).toEqual([]);
  });

  it("lists every image under public/", () => {
    const listed = new Set(rows.map((row) => row.target));
    const images = filesUnder(PUBLIC_DIR).filter((file) => IMAGE_FILE.test(file));
    expect(images.filter((file) => !listed.has(file))).toEqual([]);
  });

  it("marks a row `wired` exactly when the code loads its file", () => {
    const wired = wiredFiles();
    expect(slotsOf(rows.filter((row) => row.status === "wired" && !wired.has(row.target)))).toEqual([]);
    expect(slotsOf(rows.filter((row) => row.status !== "wired" && wired.has(row.target)))).toEqual([]);
  });

  it("marks a row `in repo` or `wired` exactly when its file is under public/", () => {
    const committed = (row: ManifestRow) => row.status === "in repo" || row.status === "wired";
    const exists = (row: ManifestRow) => existsSync(new URL(row.target, PUBLIC_DIR));
    expect(slotsOf(rows.filter((row) => committed(row) && !exists(row)))).toEqual([]);
    expect(slotsOf(rows.filter((row) => !committed(row) && exists(row)))).toEqual([]);
  });

  it("links every prompt to a heading that exists in its prompt doc", () => {
    const anchors = new Map<string, Set<string>>();
    const broken = rows.flatMap((row) =>
      [...row.prompt.matchAll(/\]\(([\w-]+\.md)#([^)]+)\)/g)].flatMap(([link, doc, anchor]) => {
        const docUrl = new URL(doc, ART_DIR);
        if (!existsSync(docUrl)) return [`${row.slot}: ${link}`];
        if (!anchors.has(doc)) anchors.set(doc, headingAnchors(readText(docUrl)));
        return anchors.get(doc)?.has(anchor) ? [] : [`${row.slot}: ${link}`];
      })
    );
    expect(broken).toEqual([]);
  });
});
