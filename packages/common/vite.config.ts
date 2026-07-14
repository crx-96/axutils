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
        "crypto/convert": "./src/crypto/convert.ts",
        "crypto/md5": "./src/crypto/md5.ts",
        "node/crypto/convert": "./src/node/crypto/convert.ts",
        "node/crypto/md5": "./src/node/crypto/md5.ts",
        "node/index": "./src/node/index.ts",
        "object/json": "./src/object/json.ts",
        "object/object": "./src/object/object.ts",
        "object/storage": "./src/object/storage.ts",
        "object/timing": "./src/object/timing.ts",
        "object/url": "./src/object/url.ts",
        "node/object/storage": "./src/node/object/storage.ts",
        "axios/http": "./src/axios/http.ts",
        "rxjs/http": "./src/rxjs/http.ts",
      },
      fileName: (format: string, entryName: string) => {
        const extension = format === "es" ? "js" : "cjs";
        return `${entryName}.${extension}`;
      },
      formats: ["es", "cjs"],
    },
    // ESM/CJS 产物：第三方包和 Node 内置模块不打包（external）
    rollupOptions: {
      // Rollup 在 Windows 上会把相对依赖解析成盘符开头的绝对路径；这些仍是包内模块，不能被误判为 external。
      external: (id: string) =>
        !id.startsWith(".") && !id.startsWith("/") && !/^[A-Za-z]:[\\/]/u.test(id),
    },
    sourcemap: true,
    target: "es2020",
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
