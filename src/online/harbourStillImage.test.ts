import { describe, expect, it } from "vitest";
import { harbourViewRecord } from "../board/harbour/harbourView";
import { HARBOUR_STILL } from "./harbourStillImage";

/** Files under public/, as served paths. */
const PUBLIC_FILES = Object.keys(import.meta.glob("../../public/**/*")).map((path) => path.replace("../../public/", ""));

describe("the harbour still (#122)", () => {
  it("was captured from the view the live scene shows; re-capture it when the map, the camera or the size changes (docs/harbour-still.md)", () => {
    expect(HARBOUR_STILL.capturedWith).toEqual(harbourViewRecord());
  });

  it("is served from public/", () => {
    expect(PUBLIC_FILES).toContain(HARBOUR_STILL.path);
  });

  it("inlines a tiny placeholder, so the harbour's colours are in the very first paint", () => {
    expect(HARBOUR_STILL.placeholder).toMatch(/^data:image\/(webp|jpeg|png);base64,/);
    expect(HARBOUR_STILL.placeholder.length).toBeLessThan(1024);
  });
});
