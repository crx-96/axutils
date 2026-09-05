import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { startBrowserServer } from "./serve-browser.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = await mkdtemp(join(tmpdir(), "axutils-browser-"));
let server;

try {
  // 构建消费项目，而非再次构建包；包源码不能绕过 exports 进入本次浏览器验证。
  await build({
    build: {
      emptyOutDir: true,
      lib: {
        entry: join(packageRoot, "test-browser/entry.ts"),
        fileName: () => "consumer.js",
        formats: ["es"],
      },
      minify: false,
      outDir: join(temporaryRoot, "bundle"),
      target: "es2020",
    },
    configFile: false,
    logLevel: "warn",
    plugins: [
      {
        generateBundle(_options, bundle) {
          for (const file of Object.values(bundle)) {
            if (file.type === "chunk" && (file.imports.length || file.dynamicImports.length)) {
              throw new Error(`浏览器测试消费产物仍有未打包依赖：${file.fileName}`);
            }
          }
        },
        name: "reject-browser-node-imports",
        resolveId(source) {
          if (isBuiltin(source)) {
            throw new Error(`浏览器消费引入了 Node 内置模块：${source}`);
          }
        },
      },
    ],
    root: packageRoot,
  });
  server = await startBrowserServer(
    join(temporaryRoot, "bundle/consumer.js"),
    join(packageRoot, "dist/index.umd.cjs"),
  );
  const cliPath = fileURLToPath(import.meta.resolve("@playwright/test/cli"));
  const child = spawn(
    process.execPath,
    [
      cliPath,
      "test",
      "--config",
      join(packageRoot, "playwright.config.ts"),
      ...process.argv.slice(2),
    ],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        AXUTILS_BROWSER_OUTPUT_DIR: join(temporaryRoot, "results"),
        AXUTILS_BROWSER_URL: server.url,
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  const interrupt = () => child.kill("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
} finally {
  try {
    await server?.close();
  } finally {
    if (process.env.AXUTILS_KEEP_BROWSER_ARTIFACTS === "1") {
      console.log(`保留浏览器测试产物：${temporaryRoot}；调试完成后请删除该目录。`);
    } else {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  }
}
