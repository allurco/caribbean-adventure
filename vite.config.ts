import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Agent worktrees live under .claude/; their copies of the suite are not ours to run.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
