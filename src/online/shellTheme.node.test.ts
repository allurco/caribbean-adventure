import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, themeColors, WCAG_AA_TEXT } from "../board/parchment";

// The online shell's inks must read at WCAG AA on its parchment (#105, #125).
const css = readFileSync(fileURLToPath(new URL("../index.css", import.meta.url)), "utf8");
const paper = themeColors(css, "shell-parchment")["shell-parchment"];
const inks = themeColors(css, "shell-ink");

describe("online shell theme (WCAG AA)", () => {
  it("declares the parchment and its inks", () => {
    expect(paper).toBeDefined();
    expect(Object.keys(inks).length).toBeGreaterThan(1);
  });

  for (const [ink, inkHex] of Object.entries(inks)) {
    it(`${ink} on shell-parchment is at least ${WCAG_AA_TEXT}:1`, () => {
      expect(contrastRatio(inkHex, paper)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    });
  }
});
