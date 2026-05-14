import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    typecheck: {
      enabled: true,
      include: ["test/**/*.test-d.ts"],
    },
  },
  resolve: {
    alias: {
      "better-activity": new URL("../better-activity/src/index.ts", import.meta.url).pathname,
    },
  },
});
