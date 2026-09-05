const verify = require("./smoke/assertions.cjs");
const manifest = require("../package.json");

const modules = {};
for (const key of Object.keys(manifest.exports)) {
  const name = key === "." ? manifest.name : manifest.name + key.slice(1);
  modules[name] = require(name);
}
verify(modules);
console.log("CJS 全入口与行为契约通过。");
