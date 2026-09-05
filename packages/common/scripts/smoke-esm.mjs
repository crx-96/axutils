import { readFileSync } from "node:fs";
import verify from "./smoke/assertions.cjs";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const modules = {};
for (const key of Object.keys(manifest.exports)) {
  const name = key === "." ? manifest.name : manifest.name + key.slice(1);
  modules[name] = await import(name);
}
verify(modules);
console.log("ESM 全入口与行为契约通过。");
