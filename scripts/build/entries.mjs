import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** exports 是入口清单；只接受仓库的双格式约定，拒绝悄悄漏构建入口。 */
export function readPackageEntries(packageRoot) {
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  // 先收集键值对，再生成普通对象，避免 __proto__ 源文件名被解释成原型赋值。
  const entryPairs = [];
  if (!manifest.exports?.["."]) throw new Error(`${manifest.name}: 缺少根 exports`);
  for (const [subpath, conditions] of Object.entries(manifest.exports)) {
    const esm = conditions?.import;
    const cjs = conditions?.require;
    // 每个路径段必须非空；重复斜线会使源码定位变成包外绝对路径。
    if (!/^\.\/dist\/[\w-]+(?:\/[\w-]+)*\.js$/u.test(esm?.default ?? "")) {
      throw new Error(`${manifest.name}${subpath}: 无效的 ESM 产物目标`);
    }
    // 用同一 stem 核对四种产物，随后映射到源码；不从子路径名称猜源码位置。
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
    entryPairs.push([stem, source]);
  }
  return { entries: Object.fromEntries(entryPairs), manifest };
}
