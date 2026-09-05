import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { build } from "vite";
import { emitCommonJsDeclarations } from "./declarations.mjs";
import { readPackageEntries } from "./entries.mjs";

const require = createRequire(import.meta.url);

// 保留经过中文 Windows 路径验证的逐项清理；符号链接只删链接，绝不递归目标。
function removeDirectory(directory) {
  if (!existsSync(directory)) return;
  if (lstatSync(directory).isSymbolicLink()) throw new Error(`dist 不能是符号链接：${directory}`);
  for (const name of readdirSync(directory)) {
    const filename = join(directory, name);
    const stat = lstatSync(filename);
    if (stat.isDirectory() && !stat.isSymbolicLink()) removeDirectory(filename);
    else unlinkSync(filename);
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
      },
    });
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
