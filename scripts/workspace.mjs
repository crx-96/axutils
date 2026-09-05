import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const required = ["build", "typecheck", "test", "test:dist", "test:consumer", "publint"];

/** 仅调度可发布包；缺少脚本直接失败，避免新包未被验证却显示全仓通过。 */
function packages() {
  return readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      JSON.parse(readFileSync(join(root, "packages", entry.name, "package.json"), "utf8")),
    )
    .filter((manifest) => !manifest.private)
    .map((manifest) => {
      if (!/^@axutils\/[a-z0-9-]+$/u.test(manifest.name)) throw new Error("无效的发布包名");
      for (const name of required) {
        if (!manifest.scripts?.[name]) throw new Error(`${manifest.name} 缺少 ${name}`);
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
  for (const phase of ["typecheck", "test", "build", "test:dist", "test:consumer", "publint"]) {
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
