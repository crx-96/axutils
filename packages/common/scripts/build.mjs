import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

// 以脚本所在目录推导包根目录，避免从其他目录调用脚本时误操作相对路径。
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distPath = join(packageRoot, "dist");

function removeFileIfExistsSync(filePath) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function removeDirectorySync(directoryPath) {
  if (!existsSync(directoryPath)) {
    return;
  }

  // 逐项删除后再删除空目录，绕开 Windows 中文路径下 fs.rmSync 偶发不生效的问题。
  for (const fileName of readdirSync(directoryPath)) {
    const filePath = join(directoryPath, fileName);

    if (lstatSync(filePath).isDirectory()) {
      removeDirectorySync(filePath);
    } else {
      removeFileIfExistsSync(filePath);
    }
  }

  rmdirSync(directoryPath);
}

function runNodeScript(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: packageRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    // 抛出异常而不是直接 process.exit，确保外层 finally 能清理临时配置。
    throw new Error(`构建子进程退出，状态码：${result.status ?? "unknown"}`);
  }
}

function copyDeclarationFilesAsCts(directoryPath) {
  for (const fileName of readdirSync(directoryPath)) {
    const filePath = join(directoryPath, fileName);

    if (statSync(filePath).isDirectory()) {
      copyDeclarationFilesAsCts(filePath);
      continue;
    }

    if (!fileName.endsWith(".d.ts")) {
      continue;
    }

    copyFileSync(filePath, filePath.replace(/\.d\.ts$/u, ".d.cts"));
  }
}

const vitePackageDir = dirname(require.resolve("vite/package.json"));
const typescriptPackageDir = dirname(require.resolve("typescript/package.json"));

// UMD 专用临时配置：第三方包打包进去，供浏览器 <script> 直接引入
// fileName 用 .cjs 扩展名：package.json 声明 "type":"module"，.js 会被 Node.js 当 ESM 加载，
// 导致 UMD 的 CJS 分支无法被 require；.cjs 扩展名确保 Node.js 以 CJS 模式加载，浏览器不受影响
// 使用进程号区分临时配置，允许多个构建进程同时运行而不互相删除配置文件。
const umdConfigPath = join(packageRoot, `.vite.umd.config.${process.pid}.mjs`);
const umdConfig = `import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "./src/umd.ts",
      fileName: () => "index.umd.cjs",
      formats: ["umd"],
      name: "AxutilsCommon",
    },
    sourcemap: true,
    target: "es2020",
  },
});
`;
writeFileSync(umdConfigPath, umdConfig, "utf8");

try {
  // 阶段 1：清空 dist
  // 先完整删除旧产物，确保不会遗留已删除源码对应的文件。
  removeDirectorySync(distPath);

  // 阶段 2：vite build（读取 vite.config.ts，产出 ESM + CJS，第三方包 external）
  runNodeScript(join(vitePackageDir, "bin", "vite.js"), ["build"]);

  // 阶段 3：UMD 全量包（单独配置，第三方包打包进去）
  runNodeScript(join(vitePackageDir, "bin", "vite.js"), ["build", "--config", umdConfigPath]);

  // 阶段 4：tsc 产出类型声明
  runNodeScript(join(typescriptPackageDir, "bin", "tsc"), ["-p", "tsconfig.build.json"]);

  // 阶段 5：复制 .d.ts 为 .d.cts
  copyDeclarationFilesAsCts(distPath);
} finally {
  // 清理临时配置
  // 即使构建中途失败，也要尽力清理临时配置，避免重复清理导致 ENOENT。
  removeFileIfExistsSync(umdConfigPath);
}
