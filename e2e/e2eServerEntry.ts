/** What the e2e backend runs, bundled by esbuild as `/api` is (ADR 0008): the router, the in-memory store, the seeds. */
export { handleApiRequest } from "../server/handleApiRequest";
export { createMemoryOnlineStore } from "../server/memoryOnlineStore";
export { newInviteCode, newMapSeed, newMatchSeed } from "../server/services";
