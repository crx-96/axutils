import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerTypes } from "./consumer/types.mjs";

const require = createRequire(import.meta.url);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const peers = JSON.parse(readFileSync(new URL("./consumer/peers.json", import.meta.url), "utf8"));
assert.deepEqual(Object.keys(peers).sort(), Object.keys(manifest.exports).sort());
assert.deepEqual(
  [...new Set(Object.values(peers).flat())].sort(),
  Object.keys(manifest.peerDependencies).sort(),
);
const temporary = mkdtempSync(join(tmpdir(), "axutils-consumer-"));
const expectedParent = resolve(tmpdir());
assert.equal(dirname(temporary), expectedParent);
assert.ok(temporary.startsWith(join(expectedParent, "axutils-consumer-")));
const tsc = join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
const runtime = process.env.AXUTILS_TEST_NODE || process.execPath;

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  // 临时目录位于 workspace 外，防止缺失 peer 被祖先 node_modules 偶然补齐。
  const executable = process.env.npm_execpath;
  if (!executable) throw new Error("请通过 pnpm test:consumer 执行打包消费验证");
  const archive = join(temporary, "common.tgz");
  const useNode = /\.[cm]?js$/u.test(executable);
  run(
    useNode ? process.execPath : executable,
    [...(useNode ? [executable] : []), "pack", "--out", archive],
    packageRoot,
    { ...process.env, npm_config_cache: join(temporary, "npm-cache") },
  );
  run("tar", ["-xf", archive, "-C", temporary], temporary);
  const groups = new Map();
  for (const [subpath, dependencies] of Object.entries(peers)) {
    const key = dependencies.join(",");
    if (!groups.has(key)) groups.set(key, { dependencies, subpaths: [] });
    groups.get(key).subpaths.push(subpath);
  }
  let groupNumber = 0;
  for (const { dependencies, subpaths } of groups.values()) {
    const fixture = join(temporary, `consumer-${groupNumber++}`);
    const modules = join(fixture, "node_modules");
    mkdirSync(join(modules, "@axutils"), { recursive: true });
    cpSync(join(temporary, "package"), join(modules, "@axutils", "common"), { recursive: true });
    writeFileSync(join(fixture, "package.json"), '{"private":true,"type":"module"}\n');
    for (const peer of dependencies) {
      // 只挂载这一组允许的 peer；其传递依赖由已锁定的安装树提供，不访问网络。
      const target = realpathSync(join(packageRoot, "node_modules", peer));
      const link = join(modules, peer);
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
    }
    const names = subpaths.map((key) =>
      key === "." ? manifest.name : manifest.name + key.slice(1),
    );
    const load = `const names = ${JSON.stringify(names)};\n`;
    writeFileSync(
      join(fixture, "runtime.mjs"),
      load +
        "for (const name of names) { const api = await import(name); if (!Object.keys(api).length) throw new Error(name); }\n",
    );
    writeFileSync(
      join(fixture, "runtime.cjs"),
      load +
        "for (const name of names) { const api = require(name); if (!Object.keys(api).length) throw new Error(name); }\n",
    );
    // NODE_PATH 不能给 CJS 偷渡 peer；ESM 本身不使用 NODE_PATH。
    const env = { ...process.env, NODE_PATH: "" };
    run(runtime, [join(fixture, "runtime.mjs")], fixture, env);
    run(runtime, [join(fixture, "runtime.cjs")], fixture, env);
    for (const format of ["mts", "cts"]) {
      writeFileSync(join(fixture, `types.${format}`), consumerTypes(manifest, subpaths, format));
    }
    writeFileSync(
      join(fixture, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          lib: ["ES2020", "DOM"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2020",
          types: [],
        },
        files: ["types.mts", "types.cts"],
      }),
    );
    run(process.execPath, [tsc, "-p", join(fixture, "tsconfig.json")], fixture, env);
    console.log(`打包消费通过：${subpaths.join("、")}；peer：${dependencies.join(", ") || "无"}`);
  }
} finally {
  rmSync(temporary, { force: true, maxRetries: 3, recursive: true });
}
