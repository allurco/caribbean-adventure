/**
 * The art manifest (docs/art/README.md) held to the code: the one list of
 * every 2D image the game needs, with its prompt, so generated art is never
 * lost. Every event card slot (cardArtSlots.ts) and every image under
 * public/ has a row; a row marked `wired` names a file the code loads; a
 * committed row's file exists; every prompt link lands on a heading.
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
  target: string | null;
  status: string;
}

const ROOT = new URL("../../", import.meta.url);
const PUBLIC_DIR = new URL("public/", ROOT);
const ART_DIR = new URL("docs/art/", ROOT);
const readText = (url: URL) => readFileSync(url, "utf8");

const IMAGE_FILE = /\.(png|jpe?g|webp|avif|gif|svg)$/i;

/** The text inside the first pair of backticks, or null. */
function backticked(cell: string): string | null {
  return /`([^`]+)`/.exec(cell)?.[1] ?? null;
}

/**
 * Every slot row of the manifest's tables: a table line whose first cell is a
 * backticked slot id. Cells: slot, shows, prompt, style, size, target, status, wired by.
 */
function parseManifest(markdown: string): ManifestRow[] {
  return markdown
    .split("\n")
    .filter((line) => /^\|\s*`/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return {
        slot: backticked(cells[0]) ?? "",
        prompt: cells[2] ?? "",
        target: backticked(cells[5] ?? ""),
        status: cells[6] ?? "",
      };
    });
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

/** The files the code loads from public/: the event cards' art and masks, the harbour still, and the icons index.html and the web manifest name. */
function wiredFiles(): Set<string> {
  const cardFiles = CARD_ART_SLOTS.flatMap((slot) => [CARD_ART[slot].file, CARD_ART[slot].flag?.mask ?? null]);
  const html = readText(new URL("index.html", ROOT));
  const htmlLinks = [...html.matchAll(/href="\/([^"]+)"/g)].map((match) => match[1]);
  const webManifest = JSON.parse(readText(new URL("manifest.webmanifest", PUBLIC_DIR))) as { icons: { src: string }[] };
  const manifestIcons = webManifest.icons.map((icon) => icon.src.replace(/^\//, ""));
  return new Set(
    [...cardFiles, HARBOUR_STILL.path, ...htmlLinks, ...manifestIcons].filter((file): file is string => !!file)
  );
}

const rows = parseManifest(readText(new URL("README.md", ART_DIR)));
const bySlot = new Map(rows.map((row) => [row.slot, row]));

describe("the manifest's parser", () => {
  it("reads a slot row's id, prompt, target and status, and skips other lines", () => {
    const sample = [
      "| Slot | Shows | Prompt | Style | Size | Target | Status | Wired by |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| `event.storm` | A squall | [Storm](event-card-prompts.md#storm) | painterly event | 3:4 | `cards/storm.webp` | made | #247 |",
    ].join("\n");
    expect(parseManifest(sample)).toEqual([
      { slot: "event.storm", prompt: "[Storm](event-card-prompts.md#storm)", target: "cards/storm.webp", status: "made" },
    ]);
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
  it("gives every row a unique slot id and a known status", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.slot).map((row) => row.prompt)).toEqual([]);
    expect(rows.filter((row) => !STATUSES.includes(row.status as Status)).map((row) => row.slot)).toEqual([]);
    expect(new Set(rows.map((row) => row.slot)).size).toBe(rows.length);
  });

  it("lists every event card slot, and the flag mask of each card that flies one", () => {
    const slots = CARD_ART_SLOTS.flatMap((slot) => [`event.${slot}`, ...(CARD_ART[slot].flag ? [`event.${slot}.flag`] : [])]);
    expect(slots.filter((slot) => !bySlot.has(slot))).toEqual([]);
  });

  it("lists every image under public/", () => {
    const listed = new Set(rows.map((row) => row.target));
    // A card's file named in CARD_ART is covered by its slot's row even before the row is moved to `wired`.
    const cardFiles = new Set(CARD_ART_SLOTS.flatMap((slot) => [CARD_ART[slot].file, CARD_ART[slot].flag?.mask]));
    const images = filesUnder(PUBLIC_DIR).filter((file) => IMAGE_FILE.test(file));
    expect(images.filter((file) => !listed.has(file) && !cardFiles.has(file))).toEqual([]);
  });

  it("marks `wired` only files the code loads, and an event card slot only with its own file", () => {
    const wired = wiredFiles();
    const wiredRows = rows.filter((row) => row.status === "wired");
    expect(wiredRows.filter((row) => !row.target || !wired.has(row.target)).map((row) => row.slot)).toEqual([]);

    const eventFile = (slot: string): string | null => {
      const [, name, mask] = slot.split(".");
      const art = CARD_ART[name as keyof typeof CARD_ART];
      if (!art) return null;
      return mask ? (art.flag?.mask ?? null) : art.file;
    };
    const mismatched = wiredRows
      .filter((row) => row.slot.startsWith("event."))
      .filter((row) => eventFile(row.slot) !== row.target)
      .map((row) => row.slot);
    expect(mismatched).toEqual([]);
  });

  it("points every committed row at a file that exists under public/", () => {
    const missing = rows
      .filter((row) => row.status === "in repo" || row.status === "wired")
      .filter((row) => !row.target || !existsSync(new URL(row.target, PUBLIC_DIR)))
      .map((row) => row.slot);
    expect(missing).toEqual([]);
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
