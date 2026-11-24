import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const required = ["build", "typecheck", "test", "test:dist", "test:consumer", "publint"];

/** 识别 exports 的嵌套 browser 条件，包括子路径和条件数组中的分支。 */
function hasBrowserExport(target) {
  if (target === null || typeof target !== "object") return false;
  return Object.hasOwn(target, "browser") || Object.values(target).some(hasBrowserExport);
}

/** 仅调度可发布包；缺少脚本直接失败，避免新包未被验证却显示全仓通过。 */
function packages() {
  return readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = join(root, "packages", entry.name);
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
      return { directory, manifest };
    })
    .filter(({ manifest }) => !manifest.private)
    .map(({ directory, manifest }) => {
      if (!/^@axutils\/[a-z0-9-]+$/u.test(manifest.name)) throw new Error("无效的发布包名");
      // CDN、browser 字段和浏览器测试目录均独立于脚本；删除脚本不会让包退出验证。
      const browser =
        manifest.unpkg ||
        manifest.jsdelivr ||
        manifest.browser ||
        hasBrowserExport(manifest.exports) ||
        existsSync(join(directory, "test-browser"));
      for (const name of browser ? [...required, "test:browser"] : required) {
        if (!manifest.scripts?.[name]?.trim()) throw new Error(`${manifest.name} 缺少 ${name}`);
      }
      return manifest;
    });
}

function run(args) {
  // pnpm run 提供自身路径，避免 Windows 中文路径的 .cmd 二次解析。
  const executable = process.env.npm_execpath;
  if (!executable) throw new Error("请通过 pnpm run 调用 workspace 检查");
  const useNode = /\.[cm]?js$/u.test(executable);
  const result = spawnSync(
    useNode ? process.execPath : executable,
    useNode ? [executable, ...args] : args,
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const manifests = packages();
if (manifests.length === 0) throw new Error("workspace 中没有可发布包");
function runPhase(phase, targets = manifests) {
  if (targets.length === 0) return;
  // 由 pnpm 按包依赖拓扑排序；文件夹的字母顺序不能决定多包构建次序。
  run(["-r", ...targets.flatMap((manifest) => ["--filter", manifest.name]), "run", phase]);
}
const action = process.argv[2];
if (action === "check") {
  run(["run", "lint"]);
  run(["run", "test:tooling"]);
  // 先完成上游构建产物与声明生成，再执行各包类型检查与单元测试，避免干净工作树下跨包引用失配。
  for (const phase of ["build", "typecheck", "test", "test:dist", "test:consumer", "publint"]) {
    runPhase(phase);
  }
  runPhase(
    "test:browser",
    manifests.filter((manifest) => manifest.scripts["test:browser"]),
  );
} else {
  if (!["test:dist", "test:consumer", "publint", "test:browser"].includes(action)) {
    throw new Error(`未知检查阶段：${action}`);
  }
  runPhase(
    action,
    action === "test:browser"
      ? manifests.filter((manifest) => manifest.scripts[action])
      : manifests,
  );
}
