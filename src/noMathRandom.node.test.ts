import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The lint gate of ADR 0007: no Math.random in game or render code outside the seed-picking call sites.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });
const RULE = "no-restricted-properties";

const ruleErrors = (results: readonly ESLint.LintResult[]) =>
  results.flatMap((r) => r.messages.filter((m) => m.ruleId === RULE).map((m) => `${r.filePath}:${m.line}`));

const lintPlanted = async (code: string, filePath: string) =>
  ruleErrors(await eslint.lintText(code, { filePath: `${repoRoot}${filePath}` }));

const PLANTED = "export const roll = (): number => Math.random();\n";

describe("lint: no Math.random in game and render code (ADR 0007)", () => {
  it("fails on a planted Math.random in src/board/", async () => {
    expect(await lintPlanted(PLANTED, "src/board/visuals/planted.ts")).toHaveLength(1);
    expect(await lintPlanted(PLANTED, "src/board/Planted.tsx")).toHaveLength(1);
  });

  it("fails on a planted Math.random in src/game/", async () => {
    expect(await lintPlanted(PLANTED, "src/game/planted.ts")).toHaveLength(1);
  });

  it("fails on Math.random passed as a value, not only called", async () => {
    expect(await lintPlanted("export const pick = (f: () => number) => f();\npick(Math.random);\n", "src/game/planted.ts")).toHaveLength(1);
  });

  it("leaves tests free to pass Math.random", async () => {
    expect(await lintPlanted(PLANTED, "src/game/planted.test.ts")).toEqual([]);
  });

  it("passes on the allowed seed-picking call sites and the code they feed", async () => {
    const files = ["src/loadGameClient.ts", "src/game/Game.ts", "src/game/mapRequest.ts", "src/game/mapGenerator.ts", "src/game/captains.ts"];
    expect(ruleErrors(await eslint.lintFiles(files.map((f) => `${repoRoot}${f}`)))).toEqual([]);
  });
});
