import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** exports 是入口清单；只接受仓库的双格式约定，拒绝悄悄漏构建入口。 */
export function readPackageEntries(packageRoot) {
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  const entries = {};
  if (!manifest.exports?.["."]) throw new Error(`${manifest.name}: 缺少根 exports`);
  for (const [subpath, conditions] of Object.entries(manifest.exports)) {
    const esm = conditions.import;
    const cjs = conditions.require;
    if (!/^\.\/dist\/[\w/-]+\.js$/u.test(esm?.default ?? "")) {
      throw new Error(`${manifest.name}${subpath}: 无效的 ESM 产物目标`);
    }
    const stem = esm.default.slice("./dist/".length, -3);
    if (
      esm.types !== `./dist/${stem}.d.ts` ||
      cjs?.default !== `./dist/${stem}.cjs` ||
      cjs.types !== `./dist/${stem}.d.cts`
    ) {
      throw new Error(`${manifest.name}${subpath}: ESM/CJS 与声明路径不一致`);
    }
    const source = resolve(packageRoot, "src", `${stem}.ts`);
    if (!existsSync(source)) throw new Error(`入口源码不存在：${source}`);
    entries[stem] = source;
  }
  return { entries, manifest };
}
