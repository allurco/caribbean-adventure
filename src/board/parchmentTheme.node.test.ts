import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, themeColors, WCAG_AA_TEXT } from "./parchment";

// The parchment cards' colours are Tailwind theme tokens; every ink must read at WCAG AA on every paper (#164).
const css = readFileSync(fileURLToPath(new URL("../index.css", import.meta.url)), "utf8");
const papers = themeColors(css, "parchment");
const inks = themeColors(css, "ink");

describe("parchment theme (WCAG AA)", () => {
  it("declares papers and inks", () => {
    expect(Object.keys(papers).length).toBeGreaterThan(1);
    expect(Object.keys(inks).length).toBeGreaterThan(1);
  });

  for (const [ink, inkHex] of Object.entries(inks)) {
    for (const [paper, paperHex] of Object.entries(papers)) {
      it(`${ink} on ${paper} is at least ${WCAG_AA_TEXT}:1`, () => {
        expect(contrastRatio(inkHex, paperHex)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
      });
    }
  }
});
