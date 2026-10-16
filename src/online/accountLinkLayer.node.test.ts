import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCOUNT_LINK_Z } from "./accountLinkPlacement";

// The corner link back to the harbour must stay clickable during the captain
// draft (#125, PR #306) but not show through the loading screen. Read the
// layers from the board's own sources so a change there fails here.
const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

function zBefore(file: string, marker: string): number {
  const text = source(file);
  const at = text.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const zs = [...text.slice(0, at).matchAll(/\bz-\[?(\d+)\]?/g)];
  return Number(zs[zs.length - 1]?.[1]);
}

function zIn(file: string): number {
  const match = /\bz-\[?(\d+)\]?/.exec(source(file));
  return Number(match?.[1]);
}

describe("the account link's layer", () => {
  it("sits above the captain draft's overlay", () => {
    expect(ACCOUNT_LINK_Z).toBeGreaterThan(zBefore("../board/Board.tsx", "<DraftScreen"));
  });

  it("sits above the game-over screen, as the match's Leave to harbour does", () => {
    expect(ACCOUNT_LINK_Z).toBeGreaterThan(zIn("../board/GameOverScreen.tsx"));
  });

  it("stays under the loading screen", () => {
    expect(ACCOUNT_LINK_Z).toBeLessThan(zIn("../board/BoardLoadingVeil.tsx"));
  });
});
