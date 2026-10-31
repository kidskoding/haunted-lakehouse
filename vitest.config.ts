import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Match tsconfig paths so component modules that import `@/…` resolve under vitest.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Tests run server modules directly, outside the react-server condition that makes
      // this marker package a no-op, so they get its empty build as the server would.
      "server-only": fileURLToPath(new URL("node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
