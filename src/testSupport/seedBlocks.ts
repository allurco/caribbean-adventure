/**
 * Scaffolding for the long seed sweeps (the village and draft placement
 * sweeps): a sweep over many seeds is split into short tests, and across
 * several test files, so it neither starves a worker nor holds up the run.
 */
import { beforeEach } from "vitest";

/** A run of seeds, first to last inclusive. */
export type SeedRange = readonly [first: number, last: number];

/**
 * Registers one test per block of `perTest` seeds from `first` to `last`, each
 * through `body(blockFirst, blockLast)`, with a macrotask yield before each.
 * Call it inside a `describe`. A sweep run as one long block starves the
 * worker's event loop past vitest's 60 s RPC timeout; and tests in a file chain
 * on microtasks, so without the yield the worker never reaches its message
 * queue between them and vitest's onTaskUpdate RPC times out.
 */
export function describeSeedBlocks(first: number, last: number, perTest: number, body: (first: number, last: number) => void): void {
  beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  for (let blockFirst = first; blockFirst <= last; blockFirst += perTest) {
    body(blockFirst, Math.min(last, blockFirst + perTest - 1));
  }
}

/**
 * What is wrong with `ranges` as a sweep of seeds 1 to `seeds`, each seed
 * exactly once: the seeds left out, swept twice, or past the last. Empty when
 * the ranges tile 1 to `seeds`.
 */
export function seedRangeGaps(ranges: readonly SeedRange[], seeds: number): string[] {
  const end = Math.max(seeds, ...ranges.map(([, last]) => last));
  const problemAt = (seed: number): string | undefined => {
    const times = ranges.filter(([first, last]) => seed >= first && seed <= last).length;
    if (seed > seeds) return times > 0 ? `past the last seed, ${seeds}` : undefined;
    if (times === 0) return "not swept";
    if (times > 1) return "swept twice";
    return undefined;
  };
  const problems: string[] = [];
  let run: { first: number; problem: string } | undefined;
  for (let seed = 1; seed <= end + 1; seed++) {
    const problem = seed <= end ? problemAt(seed) : undefined;
    if (run && problem !== run.problem) {
      problems.push(`seeds ${run.first} to ${seed - 1} are ${run.problem}`);
      run = undefined;
    }
    if (problem && !run) run = { first: seed, problem };
  }
  return problems;
}
