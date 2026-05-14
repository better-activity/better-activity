import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    components: "src/components/index.ts",
    formatters: "src/formatters.ts",
    tanstack: "src/tanstack.ts",
    swr: "src/swr.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  splitting: false,
  skipNodeModulesBundle: true,
  external: ["react", "react-dom", "better-activity", "@tanstack/react-query", "swr"],
});
