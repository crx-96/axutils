// UMD 产物冒烟测试：验证 UMD 全量包可被 Node.js require 加载，且浏览器全量包能力可用

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const AxutilsCommon = require(join(__dirname, "..", "dist", "index.umd.cjs"));

// 不注入 module 或 require，确保 UMD 走浏览器全局分支而非 CommonJS 分支。
const browserContext = vm.createContext({ TextEncoder, Uint8Array, URLSearchParams });
const bundlePath = join(__dirname, "..", "dist", "index.umd.cjs");
vm.runInContext(readFileSync(bundlePath, "utf8"), browserContext, { filename: bundlePath });
const BrowserAxutilsCommon = browserContext.AxutilsCommon;

if (typeof BrowserAxutilsCommon?.isNumber !== "function") {
  throw new Error("UMD 浏览器全局分支缺失 AxutilsCommon.isNumber 导出。");
}
if (!BrowserAxutilsCommon.isNumber(1) || BrowserAxutilsCommon.isNumber(NaN)) {
  throw new Error("UMD 浏览器全局分支 isNumber 验证失败。");
}
if (!BrowserAxutilsCommon.isEmail("umd@example.com")) {
  throw new Error("UMD 浏览器全局分支 isEmail 验证失败。");
}
if (BrowserAxutilsCommon.jsonStringify({ b: 2, a: 1 }, { sortKeys: true }) !== '{"a":1,"b":2}') {
  throw new Error("UMD 浏览器全局分支 jsonStringify 验证失败。");
}
if (new BrowserAxutilsCommon.Md5().update("hello").toHex() !== "5d41402abc4b2a76b9719d911017c592") {
  throw new Error("UMD 浏览器全局分支 Md5 验证失败。");
}
if (BrowserAxutilsCommon.objectToQuery({ tag: ["umd", "browser"] }) !== "tag=umd&tag=browser") {
  throw new Error("UMD 浏览器全局分支 objectToQuery 验证失败。");
}
if (
  JSON.stringify(BrowserAxutilsCommon.queryToObject("?tag=umd&tag=browser")) !==
  '{"tag":["umd","browser"]}'
) {
  throw new Error("UMD 浏览器全局分支 queryToObject 验证失败。");
}

if (typeof AxutilsCommon.isNumber !== "function") {
  throw new Error("UMD 产物缺失 isNumber 导出。");
}
if (typeof AxutilsCommon.isEmail !== "function") {
  throw new Error("UMD 产物缺失 isEmail 导出。");
}
if (typeof AxutilsCommon.jsonStringify !== "function") {
  throw new Error("UMD 产物缺失 jsonStringify 导出。");
}
if (typeof AxutilsCommon.Md5 !== "function") {
  throw new Error("UMD 产物缺失 Md5 导出。");
}
if (typeof AxutilsCommon.bytesToHex !== "function") {
  throw new Error("UMD 产物缺失 bytesToHex 导出。");
}
if (typeof AxutilsCommon.bytesToBase64 !== "function") {
  throw new Error("UMD 产物缺失 bytesToBase64 导出。");
}
if (
  typeof AxutilsCommon.objectToQuery !== "function" ||
  typeof AxutilsCommon.queryToObject !== "function"
) {
  throw new Error("UMD 产物缺失 URL 查询工具导出。");
}

if (!AxutilsCommon.isNumber(1) || AxutilsCommon.isNumber(NaN)) {
  throw new Error("UMD 产物 isNumber 验证失败。");
}
if (!AxutilsCommon.isEmail("umd@example.com")) {
  throw new Error("UMD 产物 isEmail 验证失败。");
}
if (AxutilsCommon.jsonStringify({ b: 2, a: 1 }, { sortKeys: true }) !== '{"a":1,"b":2}') {
  throw new Error("UMD 产物 jsonStringify 验证失败。");
}
if (new AxutilsCommon.Md5().update("hello").toHex() !== "5d41402abc4b2a76b9719d911017c592") {
  throw new Error("UMD 产物 Md5 验证失败。");
}
if (AxutilsCommon.objectToQuery({ tag: ["umd", "node"] }) !== "tag=umd&tag=node") {
  throw new Error("UMD 产物 objectToQuery 验证失败。");
}
if (JSON.stringify(AxutilsCommon.queryToObject("?tag=umd&tag=node")) !== '{"tag":["umd","node"]}') {
  throw new Error("UMD 产物 queryToObject 验证失败。");
}
if (
  AxutilsCommon.bytesToHex(
    new Uint8Array([93, 65, 64, 42, 188, 75, 42, 118, 185, 113, 157, 145, 16, 23, 197, 146]),
  ) !== "5d41402abc4b2a76b9719d911017c592"
) {
  throw new Error("UMD 产物 bytesToHex 验证失败。");
}
if (
  AxutilsCommon.bytesToBase64(
    new Uint8Array([93, 65, 64, 42, 188, 75, 42, 118, 185, 113, 157, 145, 16, 23, 197, 146]),
  ) !== "XUFAKrxLKna5cZ2REBfFkg=="
) {
  throw new Error("UMD 产物 bytesToBase64 验证失败。");
}

console.log("UMD 产物冒烟测试通过。");
