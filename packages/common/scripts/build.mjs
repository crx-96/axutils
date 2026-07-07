import { spawnSync } from "node:child_process";
import { copyFileSync, readdirSync, rmSync, statSync } from "node:fs";
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

rmSync("dist", { force: true, recursive: true });
runNodeScript(join(vitePackageDir, "bin", "vite.js"), ["build"]);
runNodeScript(join(typescriptPackageDir, "bin", "tsc"), ["-p", "tsconfig.build.json"]);
copyDeclarationFilesAsCts("dist");
