import { spawnSync } from "node:child_process";
import { copyFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

function runNodeScript(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
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
const umdConfigPath = join(process.cwd(), "vite.umd.config.mjs");
const umdConfig = `import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "./src/index.ts",
      fileName: () => "index.umd.cjs",
      formats: ["umd"],
      name: "AxutilsCommon",
    },
    sourcemap: true,
    target: "es2015",
  },
});
`;
writeFileSync(umdConfigPath, umdConfig, "utf8");

try {
  // 阶段 1：清空 dist
  rmSync("dist", { force: true, recursive: true });

  // 阶段 2：vite build（读取 vite.config.ts，产出 ESM + CJS，第三方包 external）
  runNodeScript(join(vitePackageDir, "bin", "vite.js"), ["build"]);

  // 阶段 3：UMD 全量包（单独配置，第三方包打包进去）
  runNodeScript(join(vitePackageDir, "bin", "vite.js"), ["build", "--config", umdConfigPath]);

  // 阶段 4：tsc 产出类型声明
  runNodeScript(join(typescriptPackageDir, "bin", "tsc"), ["-p", "tsconfig.build.json"]);

  // 阶段 5：复制 .d.ts 为 .d.cts
  copyDeclarationFilesAsCts("dist");
} finally {
  // 清理临时配置
  unlinkSync(umdConfigPath);
}
