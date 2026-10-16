import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMPACT_BELOW_HEIGHT, shellLayoutFor } from "./shellLayout";

// The shell picks its compact layout in script (shellLayoutFor) and restyles
// the sign-in screen in CSS (the short-landscape variant): one breakpoint (#125).
const css = readFileSync(fileURLToPath(new URL("../index.css", import.meta.url)), "utf8");
const variant = /@custom-variant short-landscape \(@media \(orientation: landscape\) and \(max-height: (\d+)px\)\)/.exec(css);

describe("the short-landscape CSS variant", () => {
  it("is declared in src/index.css", () => {
    expect(variant).not.toBeNull();
  });

  it("switches at the same height as shellLayoutFor", () => {
    const maxHeight = Number(variant?.[1]);
    expect(shellLayoutFor({ width: 1280, height: maxHeight })).toBe("compact");
    expect(shellLayoutFor({ width: 1280, height: maxHeight + 1 })).toBe("desktop");
    expect(maxHeight + 1).toBe(COMPACT_BELOW_HEIGHT);
  });
});
