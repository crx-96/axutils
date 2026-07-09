// UMD 产物冒烟测试：验证 UMD 全量包可被 Node.js require 加载，且主入口工具可用
// UMD 全量包从 src/index.ts 构建，包含主入口工具，不含 object/json 子路径

const { join } = require("node:path");

const AxutilsCommon = require(join(__dirname, "..", "dist", "index.umd.cjs"));

if (typeof AxutilsCommon.isNumber !== "function") {
  throw new Error("UMD 产物缺失 isNumber 导出。");
}
if (typeof AxutilsCommon.isEmail !== "function") {
  throw new Error("UMD 产物缺失 isEmail 导出。");
}

if (!AxutilsCommon.isNumber(1) || AxutilsCommon.isNumber(NaN)) {
  throw new Error("UMD 产物 isNumber 验证失败。");
}
if (!AxutilsCommon.isEmail("umd@example.com")) {
  throw new Error("UMD 产物 isEmail 验证失败。");
}

console.log("UMD 产物冒烟测试通过。");
