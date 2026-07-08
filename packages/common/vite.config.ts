import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: {
        index: "./src/index.ts",
        "check/platform": "./src/check/platform.ts",
        "check/reg": "./src/check/reg.ts",
        "check/type": "./src/check/type.ts",
      },
      fileName: (format, entryName) => {
        const extension = format === "es" ? "js" : "cjs";
        return `${entryName}.${extension}`;
      },
      formats: ["es", "cjs"],
    },
    sourcemap: true,
    target: "es2015",
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
