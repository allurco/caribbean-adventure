import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Agent worktrees live under `.claude/worktrees/`, inside this checkout. Ignore
// only the `.claude/` directly under this config's directory: a bare
// `**/.claude/**` would also match a worktree's own files (the watcher sees
// absolute paths), so a dev server started inside a worktree would stop
// watching itself.
const ownClaudeDir = fileURLToPath(new URL("./.claude", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The online backend's public settings (#105, src/online/supabaseConfig.ts):
  // VITE_ for ones set by hand, NEXT_PUBLIC_SUPABASE_ for the URL and
  // publishable key the Vercel Marketplace's Supabase integration injects.
  // Never widen this to a prefix that could reach a secret.
  envPrefix: ["VITE_", "NEXT_PUBLIC_SUPABASE_"],
  server: {
    watch: {
      ignored: [`${ownClaudeDir}/**`],
    },
  },
  test: {
    // Agent worktrees live under .claude/; their copies of the suite are not ours to run.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
