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
    const run = (phase = "test:dist") =>
      spawnSync(process.execPath, [join(directory, "scripts/workspace.mjs"), phase], {
        cwd: directory,
        encoding: "utf8",
        env: process.env,
      });
    const result = run();
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(readFileSync(join(directory, "order.txt"), "utf8"), "b-dependency\na-consumer\n");
    const { path, manifest } = manifests[1];
    for (const field of ["unpkg", "browser", "jsdelivr"]) {
      manifest[field] = "./dist/browser.js";
      writeFileSync(join(path, "package.json"), JSON.stringify(manifest));
      const missingBrowser = run("test:browser");
      assert.notEqual(missingBrowser.status, 0);
      assert.match(missingBrowser.stderr, /缺少 test:browser/u);
      delete manifest[field];
    }
    manifest.exports = { ".": { import: { browser: "./browser.mjs" } } };
    writeFileSync(join(path, "package.json"), JSON.stringify(manifest));
    assert.match(run("test:browser").stderr, /缺少 test:browser/u);
    delete manifest.exports;
    mkdirSync(join(path, "test-browser"));
    writeFileSync(join(path, "package.json"), JSON.stringify(manifest));
    assert.match(run("check").stderr, /缺少 test:browser/u);
    manifest.scripts["test:browser"] = manifest.scripts.test;
    writeFileSync(join(path, "package.json"), JSON.stringify(manifest));
    assert.equal(run("test:browser").status, 0);
    assert.equal(
      readFileSync(join(directory, "order.txt"), "utf8"),
      "b-dependency\na-consumer\nb-dependency\n",
    );
    delete manifest.scripts["test:consumer"];
    writeFileSync(join(path, "package.json"), JSON.stringify(manifest));
    const missing = run();
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /缺少 test:consumer/u);
  } finally {
    rmSync(directory, { force: true, maxRetries: 3, recursive: true });
  }
});

test("workspace check 先执行 build，再执行 typecheck、test 与后续产物检查", () => {
  const directory = mkdtempSync(join(tmpdir(), "axutils-workspace-check-"));
  try {
    mkdirSync(join(directory, "scripts"));
    copyFileSync(
      new URL("../workspace.mjs", import.meta.url),
      join(directory, "scripts/workspace.mjs"),
    );
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({
        private: true,
        scripts: {
          lint: "node record.cjs root:lint",
          "test:tooling": "node record.cjs root:test:tooling",
        },
      }),
    );
    writeFileSync(join(directory, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    writeFileSync(
      join(directory, "record.cjs"),
      'const fs = require("node:fs"); const path = require("node:path"); fs.appendFileSync(path.join(__dirname, "order.txt"), process.argv[2] + "\\n");',
    );
    for (const name of ["a-consumer", "b-dependency"]) {
      const pkgPath = join(directory, "packages", name);
      mkdirSync(pkgPath, { recursive: true });
      const phases = ["build", "typecheck", "test", "test:dist", "test:consumer", "publint"];
      if (name === "b-dependency") phases.push("test:browser");
      const scripts = Object.fromEntries(
        phases.map((phase) => [phase, `node ../../record.cjs ${phase}:${name}`]),
      );
      const manifest = {
        name: `@axutils/${name}`,
        scripts,
        version: "1.0.0",
        ...(name === "a-consumer"
          ? { dependencies: { "@axutils/b-dependency": "workspace:*" } }
          : {}),
      };
      writeFileSync(join(pkgPath, "package.json"), JSON.stringify(manifest));
    }
    const result = spawnSync(
      process.execPath,
      [join(directory, "scripts/workspace.mjs"), "check"],
      {
        cwd: directory,
        encoding: "utf8",
        env: process.env,
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const order = readFileSync(join(directory, "order.txt"), "utf8").trim().split("\n");
    assert.deepEqual(order, [
      "root:lint",
      "root:test:tooling",
      "build:b-dependency",
      "build:a-consumer",
      "typecheck:b-dependency",
      "typecheck:a-consumer",
      "test:b-dependency",
      "test:a-consumer",
      "test:dist:b-dependency",
      "test:dist:a-consumer",
      "test:consumer:b-dependency",
      "test:consumer:a-consumer",
      "publint:b-dependency",
      "publint:a-consumer",
      "test:browser:b-dependency",
    ]);
  } finally {
    rmSync(directory, { force: true, maxRetries: 3, recursive: true });
  }
});
