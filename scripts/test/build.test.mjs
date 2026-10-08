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

test("声明转换保留模板静态文本，并转换插值及嵌套类型中的真实 import", () => {
  const directory = mkdtempSync(join(tmpdir(), "axutils-template-declarations-"));
  try {
    writeFileSync(join(directory, "value.d.ts"), 'export type Value = "x";\n');
    const source = [
      'export type Label = `import("./not-a-module.js") from "./literal.js"`;',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: 这是待转换的声明原文，必须保留字面的模板语法。
      'export type Escaped = `\\` \\${import("./still-text.js")}`;',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: 验证声明中的 import 插值，不在测试自身求值。
      'export type Dynamic = `prefix ${import("./value.js").Value}`;',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: 保留嵌套模板和映射类型作为词法边界用例。
      'export type Nested = `${{ value: import("./value.js").Value }["value"]}-${`literal from "./other.js" ${import("./value.js").Value}`}`;',
      'export type After = import("./value.js").Value;',
    ].join("\n");
    assert.equal(
      commonJsDeclaration(source, join(directory, "index.d.ts")),
      source.replaceAll('import("./value.js")', 'import("./value.cjs")'),
    );
    assert.throws(
      () =>
        commonJsDeclaration(
          // biome-ignore lint/suspicious/noTemplateCurlyInString: 故意提供声明内的缺失模块引用。
          'export type Missing = `${import("./missing.js").Value}`;',
          join(directory, "index.d.ts"),
        ),
      /声明依赖不存在/u,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("入口派生支持 __proto__ 文件名，并拒绝空路径段", () => {
  const directory = mkdtempSync(join(tmpdir(), "axutils-special-entries-"));
  try {
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, "src/__proto__.ts"), "export {};\n");
    const entry = (stem) => ({
      // biome-ignore assist/source/useSortedKeys: 条件导出的 types 必须先于 default。
      import: { types: `./dist/${stem}.d.ts`, default: `./dist/${stem}.js` },
      // biome-ignore assist/source/useSortedKeys: 条件导出的 types 必须先于 default。
      require: { types: `./dist/${stem}.d.cts`, default: `./dist/${stem}.cjs` },
    });
    const manifest = { exports: { ".": entry("__proto__") }, name: "@axutils/example" };
    const save = () => writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
    save();
    const { entries } = readPackageEntries(directory);
    assert.deepEqual(Object.keys(entries), ["__proto__"]);
    assert.equal(
      Object.getOwnPropertyDescriptor(entries, "__proto__").value,
      join(directory, "src/__proto__.ts"),
    );
    assert.equal(Object.getPrototypeOf(entries), Object.prototype);
    for (const stem of ["/index", "feature//index", "feature/"]) {
      manifest.exports["."] = entry(stem);
      save();
      assert.throws(() => readPackageEntries(directory), /无效的 ESM 产物目标/u);
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
