import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { build } from "vite";
import { emitCommonJsDeclarations } from "./declarations.mjs";
import { readPackageEntries } from "./entries.mjs";

/** 共享构建工具从根工具链定位 TypeScript。 */
const require = createRequire(import.meta.url);

/** 按实际 CJS 输出生成 Node 的 ESM 命名门面，两种加载器共享同一模块缓存。 */
function nodeFacades(manifest) {
  // 按 Node 门面路径去重，避免多个 exports 别名指向同一 .node.mjs 时重复 emitFile。
  const seen = new Set();
  const entries = [];
  for (const entry of Object.values(manifest.exports)) {
    const target = entry?.import?.node;
    if (!target || seen.has(target)) continue;
    seen.add(target);
    entries.push(entry);
  }
  return {
    generateBundle(options, bundle) {
      if (options.format !== "cjs") return;
      for (const entry of entries) {
        const filename = entry.require.default.slice("./dist/".length);
        const chunk = bundle[filename];
        if (chunk?.type !== "chunk") throw new Error(`找不到 Node 门面的 CJS 入口：${filename}`);
        const basename = filename.split("/").at(-1);
        // 仅含 default 导出时 Rolldown CJS 输出 module.exports = value，直接透传默认导出；其余情形沿用具名桥接。
        const source =
          chunk.exports.length === 1 && chunk.exports[0] === "default"
            ? `export { default } from "./${basename}";\n`
            : // 默认导入读取真实 module.exports，不依赖不同 Node 版本对 CJS 命名导出的静态识别。
              `import api from "./${basename}";\n${chunk.exports
                .map(
                  (name, index) =>
                    `const v${index} = api[${JSON.stringify(name)}]; export { v${index} as ${name} };`,
                )
                .join("\n")}\n`;
        this.emitFile({
          fileName: entry.import.node.slice("./dist/".length),
          source,
          type: "asset",
        });
      }
    },
    name: "axutils-node-esm-facades",
  };
}

/** 把 Vite 从 UMD 实际模块收集的许可正文附在脚本末尾，单文件 CDN 分发也携带版权声明。 */
function includeUmdLicenses(packageRoot, manifest, outDir) {
  const ownLicense = join(outDir, "LICENSE");
  copyFileSync(
    existsSync(join(packageRoot, "LICENSE"))
      ? join(packageRoot, "LICENSE")
      : new URL("../../LICENSE", import.meta.url),
    ownLicense,
  );
  const records = JSON.parse(readFileSync(join(outDir, "THIRD-PARTY-LICENSES.json"), "utf8"));
  const notices = [manifest.name, readFileSync(ownLicense, "utf8")];
  for (const { name, version, text } of records) {
    if (!text?.trim()) throw new Error(`UMD 捆绑依赖缺少许可正文：${name}@${version}`);
    notices.push(`${name}@${version}`, text);
  }
  // 附加在输出末尾不改变原有代码的 sourcemap 行号；上游许可证可能自带注释结束符。
  appendFileSync(
    resolve(packageRoot, manifest.unpkg),
    `\n/*!\n${notices.join("\n\n").replaceAll("*/", "* /")}\n*/\n`,
  );
}

/**
 * 清理构建输出目录；保留经过中文 Windows 路径验证的逐项清理，符号链接只删链接本身，绝不递归目标。
 * @param {string} directory 待清理目录路径。
 */
function removeDirectory(directory) {
  // 使用 lstatSync 替代 existsSync，防止悬空符号链接被误判为不存在而绕过校验。
  const rootStat = lstatSync(directory, { throwIfNoEntry: false });
  if (!rootStat) return;
  if (rootStat.isSymbolicLink()) throw new Error(`dist 不能是符号链接：${directory}`);
  if (!rootStat.isDirectory()) throw new Error(`dist 必须是目录：${directory}`);
  for (const name of readdirSync(directory)) {
    const filename = join(directory, name);
    const stat = lstatSync(filename);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      removeDirectory(filename);
    } else if (stat.isSymbolicLink()) {
      // Windows 目录符号链接与 junction 在 unlinkSync 返回 EPERM/EISDIR 时回退 rmdirSync，仅移除链接本身。
      try {
        unlinkSync(filename);
      } catch (error) {
        if (error?.code === "EPERM" || error?.code === "EISDIR") rmdirSync(filename);
        else throw error;
      }
    } else {
      unlinkSync(filename);
    }
  }
  rmdirSync(directory);
}

/** 包级入口只提供根目录与可选 UMD 设置，共享流程不修改 package.json。 */
export async function buildPackage(packageRoot, { umd } = {}) {
  packageRoot = resolve(packageRoot);
  const { entries, manifest } = readPackageEntries(packageRoot);
  const externalPackages = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
  const outDir = resolve(packageRoot, "dist");
  if (!outDir.startsWith(packageRoot + sep)) throw new Error("dist 超出包目录");
  removeDirectory(outDir);
  const common = {
    build: { emptyOutDir: false, outDir, sourcemap: true, target: "es2020" },
    configFile: false,
    publicDir: false,
    root: packageRoot,
  };
  await build({
    ...common,
    build: {
      ...common.build,
      lib: {
        entry: entries,
        fileName: (format, name) => `${name}.${format === "es" ? "js" : "cjs"}`,
        formats: ["es", "cjs"],
      },
      rollupOptions: {
        // 只 external 已声明依赖；Oxc 等构建器注入的 helper 必须随产物打包。
        external: (id) =>
          isBuiltin(id) ||
          externalPackages.some((name) => id === name || id.startsWith(`${name}/`)),
      },
    },
    plugins: [nodeFacades(manifest)],
  });
  if (umd) {
    if (
      !/^\.\/dist\/[\w.-]+\.cjs$/u.test(manifest.unpkg ?? "") ||
      manifest.jsdelivr !== manifest.unpkg
    )
      throw new Error("UMD CDN 入口不一致");
    await build({
      ...common,
      build: {
        ...common.build,
        lib: {
          entry: resolve(packageRoot, umd.entry),
          fileName: () => manifest.unpkg.slice("./dist/".length),
          formats: ["umd"],
          name: umd.name,
        },
        license: { fileName: "THIRD-PARTY-LICENSES.json" },
      },
    });
    includeUmdLicenses(packageRoot, manifest, outDir);
  }
  const tsc = join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
  const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], {
    cwd: packageRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`声明构建失败：${result.status}`);
  emitCommonJsDeclarations(outDir);
}
