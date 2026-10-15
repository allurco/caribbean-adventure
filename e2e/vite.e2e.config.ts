/**
 * The dev server for the browser tests of online play (#113): the app's own
 * config plus the stand-in backend (`e2eBackend.ts`). Used only by
 * `e2e/playwright.config.ts`.
 */
import { mergeConfig } from "vite";
import base from "../vite.config";
import { e2eBackend } from "./e2eBackend";

export const E2E_PORT = 5199;

export default mergeConfig(base, {
  plugins: [e2eBackend()],
  server: { port: E2E_PORT, strictPort: true },
});
