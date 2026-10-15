/**
 * Browser tests of online play (#113): `npm run test:e2e`. They run against
 * the stand-in backend (`e2eBackend.ts`), so they need no Docker.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  // Two boards render in software WebGL in headless Chromium: a run takes about four minutes.
  timeout: 420_000,
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 800 } },
  webServer: {
    command: "npx vite --config e2e/vite.e2e.config.ts",
    cwd: "..",
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: `http://localhost:${PORT}/e2e-supabase`,
      VITE_SUPABASE_ANON_KEY: "e2e-anon-key",
    },
  },
});
