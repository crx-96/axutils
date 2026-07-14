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
if (
  typeof BrowserAxutilsCommon.RxHttpClient !== "function" ||
  typeof BrowserAxutilsCommon.HttpRequestError !== "function"
) {
  throw new Error("UMD 浏览器全局分支缺失 RxJS HTTP 导出。");
}
if (
  typeof BrowserAxutilsCommon.PromiseHttpClient !== "function" ||
  typeof BrowserAxutilsCommon.PromiseHttpRequestError !== "function"
) {
  throw new Error("UMD 浏览器全局分支缺失 Axios Promise HTTP 导出。");
}
if (!BrowserAxutilsCommon.isNumber(1) || BrowserAxutilsCommon.isNumber(NaN)) {
  throw new Error("UMD 浏览器全局分支 isNumber 验证失败。");
}
if (!BrowserAxutilsCommon.isEmail("umd@example.com")) {
  throw new Error("UMD 浏览器全局分支 isEmail 验证失败。");
}
if (
  typeof BrowserAxutilsCommon.debounce !== "function" ||
  typeof BrowserAxutilsCommon.throttle !== "function" ||
  typeof BrowserAxutilsCommon.deepClone !== "function"
) {
  throw new Error("UMD 浏览器全局分支对象工具导出验证失败。");
}
if (BrowserAxutilsCommon.throttle(() => "umd", 0)() !== "umd") {
  throw new Error("UMD 浏览器全局分支 throttle 调用验证失败。");
}
const browserCloneSource = vm.runInContext("({ nested: { value: 1 } })", browserContext);
const browserClone = BrowserAxutilsCommon.deepClone(browserCloneSource);
if (browserClone === browserCloneSource || browserClone.nested === browserCloneSource.nested) {
  throw new Error("UMD 浏览器全局分支 deepClone 验证失败。");
}
const browserDebounced = BrowserAxutilsCommon.debounce(() => {}, 0);
if (typeof browserDebounced.cancel !== "function") {
  throw new Error("UMD 浏览器全局分支 debounce cancel 验证失败。");
}
browserDebounced.cancel();
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
if (typeof BrowserAxutilsCommon.StorageUtils !== "function") {
  throw new Error("UMD 浏览器全局分支缺失 StorageUtils 导出。");
}
const browserStorage = new BrowserAxutilsCommon.StorageUtils({ prefix: "smoke-umd-" });
browserStorage.set("key", "value");
if (browserStorage.get("key") !== "value") {
  throw new Error("UMD 浏览器全局分支 storage 读写验证失败。");
}

// 使用 Node Realm 中的 UMD 函数复制浏览器 Realm 创建的对象，覆盖跨 Realm 输入边界。
const crossRealmCloneSource = vm.runInContext(
  "({ nested: { value: 1 }, date: new Date(0), regexp: /x/g, map: new Map([[{ id: 1 }, { value: 2 }]]), set: new Set([{ id: 3 }]) })",
  browserContext,
);
const crossRealmClone = AxutilsCommon.deepClone(crossRealmCloneSource);
const sourceMapEntry = [...crossRealmCloneSource.map.entries()][0];
const clonedMapEntry = [...crossRealmClone.map.entries()][0];
const sourceSetValue = [...crossRealmCloneSource.set][0];
const clonedSetValue = [...crossRealmClone.set][0];
if (
  crossRealmClone === crossRealmCloneSource ||
  crossRealmClone.nested === crossRealmCloneSource.nested ||
  crossRealmClone.date === crossRealmCloneSource.date ||
  crossRealmClone.regexp === crossRealmCloneSource.regexp ||
  crossRealmClone.map === crossRealmCloneSource.map ||
  crossRealmClone.set === crossRealmCloneSource.set ||
  clonedMapEntry?.[0] === sourceMapEntry?.[0] ||
  clonedMapEntry?.[1] === sourceMapEntry?.[1] ||
  clonedSetValue === sourceSetValue
) {
  throw new Error("UMD 产物跨 Realm deepClone 验证失败。");
}

if (typeof AxutilsCommon.isNumber !== "function") {
  throw new Error("UMD 产物缺失 isNumber 导出。");
}
if (
  typeof AxutilsCommon.RxHttpClient !== "function" ||
  typeof AxutilsCommon.HttpRequestError !== "function"
) {
  throw new Error("UMD 产物缺失 RxJS HTTP 导出。");
}
if (
  typeof AxutilsCommon.PromiseHttpClient !== "function" ||
  typeof AxutilsCommon.PromiseHttpRequestError !== "function"
) {
  throw new Error("UMD 产物缺失 Axios Promise HTTP 导出。");
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
if (typeof AxutilsCommon.StorageUtils !== "function") {
  throw new Error("UMD 产物缺失 StorageUtils 导出。");
}
if (
  typeof AxutilsCommon.debounce !== "function" ||
  typeof AxutilsCommon.throttle !== "function" ||
  typeof AxutilsCommon.deepClone !== "function"
) {
  throw new Error("UMD 产物缺失对象工具导出。");
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
