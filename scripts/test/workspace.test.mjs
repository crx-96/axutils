import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("workspace 按依赖顺序验证多包，并拒绝缺少检查脚本的发布包", () => {
  const directory = mkdtempSync(join(tmpdir(), "axutils-workspace-"));
  try {
    mkdirSync(join(directory, "scripts"));
    copyFileSync(
      new URL("../workspace.mjs", import.meta.url),
      join(directory, "scripts/workspace.mjs"),
    );
    writeFileSync(join(directory, "package.json"), '{"private":true}');
    writeFileSync(join(directory, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    writeFileSync(
      join(directory, "record.cjs"),
      'require("node:fs").appendFileSync("../../order.txt", process.argv[2] + "\\n");',
    );
    const manifests = [];
    for (const name of ["a-consumer", "b-dependency"]) {
      const path = join(directory, "packages", name);
      mkdirSync(path, { recursive: true });
      const scripts = Object.fromEntries(
        ["build", "typecheck", "test", "test:dist", "test:consumer", "publint"].map((phase) => [
          phase,
          `node ../../record.cjs ${name}`,
        ]),
      );
      const manifest = {
        name: `@axutils/${name}`,
        scripts,
        version: "1.0.0",
        ...(name === "a-consumer"
          ? { dependencies: { "@axutils/b-dependency": "workspace:*" } }
          : {}),
      };
      manifests.push({ manifest, path });
      writeFileSync(join(path, "package.json"), JSON.stringify(manifest));
    }
    const run = () =>
      spawnSync(process.execPath, [join(directory, "scripts/workspace.mjs"), "test:dist"], {
        cwd: directory,
        encoding: "utf8",
        env: process.env,
      });
    const result = run();
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(readFileSync(join(directory, "order.txt"), "utf8"), "b-dependency\na-consumer\n");
    const { path, manifest } = manifests[1];
    delete manifest.scripts["test:consumer"];
    writeFileSync(join(path, "package.json"), JSON.stringify(manifest));
    const missing = run();
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /缺少 test:consumer/u);
  } finally {
    rmSync(directory, { force: true, maxRetries: 3, recursive: true });
  }
});
