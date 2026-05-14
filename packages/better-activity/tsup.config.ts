import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "adapters/memory": "src/adapters/memory.ts",
    "adapters/postgres": "src/adapters/postgres.ts",
    "adapters/mysql": "src/adapters/mysql.ts",
    "adapters/sqlite": "src/adapters/sqlite.ts",
    "adapters/mongodb": "src/adapters/mongodb.ts",
    "adapters/drizzle": "src/adapters/drizzle.ts",
    "adapters/prisma": "src/adapters/prisma.ts",
    "adapters/kysely": "src/adapters/kysely.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  splitting: false,
  skipNodeModulesBundle: true,
});
