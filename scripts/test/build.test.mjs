import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commonJsDeclaration } from "../build/declarations.mjs";
import { readPackageEntries } from "../build/entries.mjs";

test("CJS 声明重写模块引用，同时保留注释、peer 和普通字符串类型", () => {
  const directory = mkdtempSync(join(tmpdir(), "axutils-declarations-"));
  try {
    writeFileSync(join(directory, "value.d.ts"), "export interface Value {}\n");
    const source = [
      'export { Value } from "./value.js";',
      'import type { Value } from "./value.js";',
      'export type Alias = import("./value.js").Value;',
      'import type { AxiosError } from "axios";',
      '// export { Value } from "./value.js";',
      'export type Literal = "./value.js";',
    ].join("\n");
    const output = commonJsDeclaration(source, join(directory, "index.d.ts"));
    assert.equal(
      output,
      source
        .replaceAll('from "./value.js";', 'from "./value.cjs";')
        .replace('import("./value.js")', 'import("./value.cjs")')
        .replace(
          '// export { Value } from "./value.cjs";',
          '// export { Value } from "./value.js";',
        ),
    );
    assert.throws(
      () => commonJsDeclaration('export * from "./missing.js";', join(directory, "index.d.ts")),
      /声明依赖不存在/u,
    );
    assert.throws(
      () => commonJsDeclaration('export * from "./value";', join(directory, "index.d.ts")),
      /显式使用/u,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("构建依据产物目标定位 node/index，而非把导出键猜成 node.ts", () => {
  const directory = mkdtempSync(join(tmpdir(), "axutils-entries-"));
  try {
    mkdirSync(join(directory, "src/node"), { recursive: true });
    writeFileSync(join(directory, "src/index.ts"), "export {};\n");
    writeFileSync(join(directory, "src/node/index.ts"), "export {};\n");
    const entry = (stem) => ({
      // biome-ignore assist/source/useSortedKeys: 条件导出必须先匹配 types，再匹配 default。
      import: { types: `./dist/${stem}.d.ts`, default: `./dist/${stem}.js` },
      // biome-ignore assist/source/useSortedKeys: 条件导出必须先匹配 types，再匹配 default。
      require: { types: `./dist/${stem}.d.cts`, default: `./dist/${stem}.cjs` },
    });
    const manifest = {
      exports: { ".": entry("index"), "./node": entry("node/index") },
      name: "@axutils/example",
    };
    const save = () => writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
    save();
    assert.deepEqual(readPackageEntries(directory).entries, {
      index: join(directory, "src/index.ts"),
      "node/index": join(directory, "src/node/index.ts"),
    });
    manifest.exports["./node"].require.types = "./dist/wrong.d.cts";
    save();
    assert.throws(() => readPackageEntries(directory), /声明路径不一致/u);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
