import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../packages/", import.meta.url));
const runtime = process.env.AXUTILS_TEST_NODE || process.execPath;
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = join(root, entry.name);
  const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  if (manifest.private) continue;
  const scripts = ["smoke-esm.mjs", "smoke-cjs.cjs"];
  if (manifest.unpkg) scripts.push("smoke-umd.cjs");
  for (const script of scripts) {
    const result = spawnSync(runtime, [join(directory, "scripts", script)], {
      cwd: directory,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
