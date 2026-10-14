import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
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
  server: {
    watch: {
      ignored: [`${ownClaudeDir}/**`],
    },
  },
});
