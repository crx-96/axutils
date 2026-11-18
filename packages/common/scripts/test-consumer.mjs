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
import { buildBrowserConsumer } from "./consumer/browser-bundle.mjs";
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
  // 使用相对路径，避免 GNU tar 将 Windows 盘符解析为远程主机。
  run("tar", ["-xf", "common.tgz"], temporary);
  const packed = join(temporary, "package");
  const notices = JSON.parse(readFileSync(join(packed, "dist/THIRD-PARTY-LICENSES.json"), "utf8"));
  const umd = readFileSync(join(packed, manifest.unpkg), "utf8");
  const sources = JSON.parse(readFileSync(join(packed, `${manifest.unpkg}.map`), "utf8")).sources;
  // sourcemap 独立于许可生成器，也能查出 tslib 这样的传递依赖被漏收。
  const bundled = sources.flatMap((path) => {
    const parts = path.split("/node_modules/");
    return parts.length === 1 ? [] : [parts.at(-1).match(/^(?:@[^/]+\/)?[^/]+/u)[0]];
  });
  assert.ok(bundled.length);
  assert.deepEqual([...new Set(bundled)].sort(), notices.map(({ name }) => name).sort());
  assert.ok(umd.includes(readFileSync(join(packed, "dist/LICENSE"), "utf8").trim()));
  for (const { name, version, text } of notices) {
    assert.ok(
      text.trim() &&
        umd.includes(`${name}@${version}`) &&
        umd.includes(text.replaceAll("*/", "* /")),
      name,
    );
  }
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
    cpSync(new URL("./consumer/mixed-runtime.mjs", import.meta.url), join(fixture, "mixed.mjs"));
    for (const first of ["esm", "cjs"]) run(runtime, ["mixed.mjs", first, ...names], fixture, env);
    if (subpaths.includes(".")) {
      await buildBrowserConsumer(fixture);
      run(
        runtime,
        [
          "--input-type=module",
          "-e",
          'import {color,lazy} from "./bundle/main.mjs"; if (color !== "#808080" || !await lazy()) throw Error("浏览器 ESM 分块消费失败");',
        ],
        fixture,
        env,
      );
    }
    const typeFiles = ["types.mts", "types.cts"];
    for (const format of ["mts", "cts"]) {
      writeFileSync(join(fixture, `types.${format}`), consumerTypes(manifest, subpaths, format));
      // 与文档共用原始示例，在真实 tarball 的 ESM/CJS 声明下检查直接消费，无源码别名。
      if (subpaths.includes("./rxjs/http")) {
        const example = `rxjs-context-example.${format}`;
        writeFileSync(
          join(fixture, example),
          readFileSync(
            new URL("../../../docs/examples/common/rxjs-context.ts", import.meta.url),
            "utf8",
          ),
        );
        typeFiles.push(example);
      }
    }
    const browserTypes = [];
    if (dependencies.includes("axios")) {
      // 两种 Axios 声明继续接受真实的浏览器 Fetch API，不能把宿主类型一律替换成 never。
      for (const format of ["mts", "cts"]) {
        const filename = `web-fetch.${format}`;
        writeFileSync(
          join(fixture, filename),
          [
            'type Env = NonNullable<import("axios").AxiosRequestConfig["env"]>;',
            "const env: Env = { Request, fetch };",
            'const buildRequest = (init: RequestInit): Request => new env.Request!(new Request("/"), init);',
            "const buildResponse = (body: Blob | FormData, init: ResponseInit): Response => new env.Response!(body, init);",
            "void [buildRequest, buildResponse];",
          ].join("\n"),
        );
        browserTypes.push(filename);
      }
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
        files: [...typeFiles, ...browserTypes],
      }),
    );
    run(process.execPath, [tsc, "-p", join(fixture, "tsconfig.json")], fixture, env);
    if (dependencies.includes("axios")) {
      // 用真正的 Node 14 声明替代开发机的 Node 24 类型，严格禁止 DOM 或全局 Fetch 混入。
      const typeRoot = join(modules, "@types");
      mkdirSync(typeRoot);
      symlinkSync(
        dirname(require.resolve("node14-types/package.json")),
        join(typeRoot, "node"),
        process.platform === "win32" ? "junction" : "dir",
      );
      writeFileSync(
        join(fixture, "node-only.ts"),
        "// @ts-expect-error Node 14 未声明浏览器文档\nvoid document;\n// @ts-expect-error Node 14 未声明全局 Fetch 请求\nvoid Request;\n",
      );
      writeFileSync(
        join(fixture, "node14.json"),
        JSON.stringify({
          compilerOptions: {
            // @types/node 14 引入 esnext.intl，TS 7 的该标准库依赖 ES2021.Intl 的 DateTimeRangeFormatPart。
            lib: ["ES2020", "ES2021.Intl"],
            types: ["node"],
          },
          extends: "./tsconfig.json",
          files: [...typeFiles, "node-only.ts"],
        }),
      );
      run(process.execPath, [tsc, "-p", join(fixture, "node14.json")], fixture, env);
    }
    console.log(`打包消费通过：${subpaths.join("、")}；peer：${dependencies.join(", ") || "无"}`);
  }
} finally {
  rmSync(temporary, { force: true, maxRetries: 3, recursive: true });
}
