import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { join } from "node:path";
import { build } from "vite";

/** 从解包目录按浏览器条件构建可执行的分块 ESM，检查静态裁剪与动态导入。 */
export async function buildBrowserConsumer(fixture) {
  const entry = join(fixture, "browser.mjs");
  writeFileSync(
    entry,
    [
      'import { mixRgbColor } from "@axutils/common";',
      'export const color = mixRgbColor("#000000", "#ffffff", 0.5);',
      'export const lazy = async () => (await import("@axutils/common/crypto/convert")).decodeHex("ff")[0] === 255;',
    ].join("\n"),
  );
  const result = await build({
    build: {
      lib: { entry, fileName: () => "main.mjs", formats: ["es"] },
      minify: false,
      outDir: join(fixture, "bundle"),
      target: "es2020",
    },
    configFile: false,
    logLevel: "warn",
    plugins: [
      {
        enforce: "pre",
        name: "check-browser-conditions",
        resolveId(id) {
          if (isBuiltin(id)) throw new Error(`浏览器引入 Node 内置模块 ${id}`);
        },
      },
    ],
    root: fixture,
  });
  const chunks = [result]
    .flat()
    .flatMap((output) => output.output)
    .filter((file) => file.type === "chunk");
  assert.ok(
    chunks.some((chunk) => chunk.isEntry && chunk.dynamicImports.length),
    "动态导入应生成异步分块",
  );
  for (const chunk of chunks) {
    assert.ok(
      chunk.moduleIds.every((id) => !/\.(?:cjs|node\.mjs)$/u.test(id)),
      "浏览器必须使用纯 ESM",
    );
    assert.doesNotMatch(
      chunk.code,
      /localStorage|sessionStorage/u,
      "仅选颜色函数时存储实现应被裁剪",
    );
  }
}
