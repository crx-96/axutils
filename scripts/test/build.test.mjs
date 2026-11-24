import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { declarationTokens } from "../build/declaration-tokens.mjs";
import { commonJsDeclaration } from "../build/declarations.mjs";
import { readPackageEntries } from "../build/entries.mjs";
import { buildPackage } from "../build/package.mjs";

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

test("声明词法扫描保留模板边界 token 并识别 Unicode 标识符", () => {
  const directory = mkdtempSync(join(tmpdir(), "axutils-token-boundary-"));
  try {
    writeFileSync(join(directory, "value.d.ts"), 'export type Value = "x";\n');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 验证模板边界 token 序列，不在测试自身求值。
    const templateSample = '`${from} -> ${"./umd.js"}`';
    assert.deepEqual(
      [...declarationTokens(templateSample)],
      [
        { start: 0, value: "`" },
        { start: 1, value: "${" },
        { start: 3, value: "from" },
        { start: 7, value: "}" },
        { start: 12, value: "${" },
        { start: 14, value: '"./umd.js"' },
        { start: 24, value: "}" },
        { start: 25, value: "`" },
      ],
    );
    assert.deepEqual(
      [...declarationTokens('中文from "./not-a-module"')],
      [
        { start: 0, value: "中文from" },
        { start: 7, value: '"./not-a-module"' },
      ],
    );
    const source = [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: 保留跨插值的模板类型原文作为回归用例。
      'export type Route = `${from} -> ${"./umd.js"}`;',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: 保留包含 Unicode 标识符的模板类型原文作为回归用例。
      'export type Localized = `${中文from} -> ${"./not-a-module"}`;',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: 验证模板插值中的真实 import 仍被改写。
      'export type Real = `${import("./value.js").Value}`;',
    ].join("\n");
    assert.equal(
      commonJsDeclaration(source, join(directory, "index.d.ts")),
      source.replace('import("./value.js")', 'import("./value.cjs")'),
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("CJS 声明改写支持 declare module、import = require、.json 校验并拒绝裸目录引用", () => {
  const directory = mkdtempSync(join(tmpdir(), "axutils-decl-syntax-"));
  try {
    writeFileSync(join(directory, "value.d.ts"), "export interface Value {}\n");
    writeFileSync(join(directory, "data.json"), '{"ok":true}\n');
    const source = [
      'declare module "./value.js" { export const extra: number; }',
      'import legacy = require("./value.js");',
      'import data from "./data.json";',
      'import meta from "./data.json" with { type: "json" };',
    ].join("\n");
    assert.equal(
      commonJsDeclaration(source, join(directory, "index.d.ts")),
      source.replaceAll('"./value.js"', '"./value.cjs"'),
    );
    assert.throws(
      () =>
        commonJsDeclaration('import missing from "./missing.json";', join(directory, "index.d.ts")),
      /声明依赖不存在/u,
    );
    assert.throws(
      () => commonJsDeclaration('declare module "./missing.js" {}', join(directory, "index.d.ts")),
      /声明依赖不存在/u,
    );
    assert.throws(
      () =>
        commonJsDeclaration(
          'import legacy = require("./missing.js");',
          join(directory, "index.d.ts"),
        ),
      /声明依赖不存在/u,
    );
    for (const bad of [
      'export * from ".";',
      'export * from "..";',
      "import '.';",
      "import '..';",
      'declare module "." {}',
      'import legacy = require("..");',
    ]) {
      assert.throws(() => commonJsDeclaration(bad, join(directory, "index.d.ts")), /显式使用/u);
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("nodeFacades 兼容纯默认导出并对重复 import.node 别名去重", async () => {
  const directory = mkdtempSync(join(tmpdir(), "axutils-node-facade-"));
  try {
    mkdirSync(join(directory, "src"), { recursive: true });
    writeFileSync(
      join(directory, "src/index.ts"),
      "const marker = { answer: 42 };\nexport default marker;\n",
    );
    writeFileSync(
      join(directory, "src/mixed.ts"),
      'export const named = "ok";\nexport default { kind: "mixed" };\n',
    );
    const nodeEntry = (stem) => ({
      // biome-ignore assist/source/useSortedKeys: 条件导出必须保持 types -> node -> default 顺序。
      import: {
        types: `./dist/${stem}.d.ts`,
        node: `./dist/${stem}.node.mjs`,
        default: `./dist/${stem}.js`,
      },
      // biome-ignore assist/source/useSortedKeys: 条件导出必须先匹配 types，再匹配 default。
      require: { types: `./dist/${stem}.d.cts`, default: `./dist/${stem}.cjs` },
    });
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({
        exports: {
          ".": nodeEntry("index"),
          "./alias": nodeEntry("index"),
          "./mixed": nodeEntry("mixed"),
        },
        name: "@axutils/facade-fixture",
        type: "module",
      }),
    );
    writeFileSync(
      join(directory, "tsconfig.build.json"),
      JSON.stringify({
        compilerOptions: {
          declaration: true,
          emitDeclarationOnly: true,
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir: "dist",
          rootDir: "src",
          strict: true,
          target: "ES2020",
        },
        include: ["src"],
      }),
    );
    await buildPackage(directory);
    assert.equal(
      readFileSync(join(directory, "dist/index.node.mjs"), "utf8"),
      'export { default } from "./index.cjs";\n',
    );
    const require = createRequire(import.meta.url);
    const cjsDefault = require(join(directory, "dist/index.cjs"));
    const esmDefault = await import(pathToFileURL(join(directory, "dist/index.node.mjs")).href);
    assert.deepEqual(esmDefault.default, { answer: 42 });
    assert.equal(esmDefault.default, cjsDefault);
    const esmMixed = await import(pathToFileURL(join(directory, "dist/mixed.node.mjs")).href);
    assert.equal(esmMixed.named, "ok");
    assert.deepEqual(esmMixed.default, { kind: "mixed" });
  } finally {
    rmSync(directory, { force: true, maxRetries: 3, recursive: true });
  }
});

test("buildPackage 拦截悬空或非目录 dist，并安全清理子目录符号链接而不删目标内容", async () => {
  const directory = mkdtempSync(join(tmpdir(), "axutils-remove-dir-"));
  try {
    const pkgDir = join(directory, "pkg");
    const distDir = join(pkgDir, "dist");
    const outsideDir = join(directory, "outside");
    mkdirSync(join(pkgDir, "src"), { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(outsideDir, "keep.txt"), "preserve");
    writeFileSync(join(pkgDir, "src/index.ts"), "export const value = 1;\n");
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({
        exports: {
          ".": {
            // biome-ignore assist/source/useSortedKeys: 条件导出必须先匹配 types，再匹配 default。
            import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
            // biome-ignore assist/source/useSortedKeys: 条件导出必须先匹配 types，再匹配 default。
            require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
          },
        },
        name: "@axutils/remove-dir-fixture",
        type: "module",
      }),
    );
    writeFileSync(
      join(pkgDir, "tsconfig.build.json"),
      JSON.stringify({
        compilerOptions: {
          declaration: true,
          emitDeclarationOnly: true,
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir: "dist",
          rootDir: "src",
          strict: true,
          target: "ES2020",
        },
        include: ["src"],
      }),
    );
    const linkType = process.platform === "win32" ? "junction" : "dir";
    symlinkSync(join(directory, "missing-target"), distDir, linkType);
    await assert.rejects(() => buildPackage(pkgDir), /dist 不能是符号链接/u);
    rmSync(distDir, { force: true, recursive: true });

    writeFileSync(distDir, "not a directory");
    await assert.rejects(() => buildPackage(pkgDir), /dist 必须是目录/u);
    unlinkSync(distDir);

    mkdirSync(join(distDir, "nested"), { recursive: true });
    writeFileSync(join(distDir, "nested/stale.txt"), "old");
    symlinkSync(outsideDir, join(distDir, "linked-dir"), linkType);
    await buildPackage(pkgDir);
    assert.equal(existsSync(join(distDir, "linked-dir")), false);
    assert.equal(existsSync(join(distDir, "nested")), false);
    assert.equal(existsSync(join(distDir, "index.js")), true);
    assert.equal(readFileSync(join(outsideDir, "keep.txt"), "utf8"), "preserve");
  } finally {
    rmSync(directory, { force: true, maxRetries: 3, recursive: true });
  }
});
