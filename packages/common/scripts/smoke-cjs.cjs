const { isEmail: isEmailFromEntry, isNumber: isNumberFromEntry } = require("@axutils/common");
const {
  isEmail: isEmailFromReg,
  isPhoneCn: isPhoneCnFromReg,
} = require("@axutils/common/check/reg");
const {
  isBrowser: isBrowserFromPlatform,
  isNode: isNodeFromPlatform,
} = require("@axutils/common/check/platform");
const {
  isArray: isArrayFromType,
  isBoolean: isBooleanFromType,
} = require("@axutils/common/check/type");
const {
  jsonParse: jsonParseFromObjectJson,
  jsonParseSafe: jsonParseSafeFromObjectJson,
  jsonStringify: jsonStringifyFromObjectJson,
  jsonStringifySafe: jsonStringifySafeFromObjectJson,
} = require("@axutils/common/object/json");

if (!isNumberFromEntry(1) || isNumberFromEntry(NaN)) {
  throw new Error("CJS 主入口类型判断验证失败。");
}

if (!isEmailFromEntry("cjs@example.com")) {
  throw new Error("CJS 主入口正则判断验证失败。");
}

if (!isArrayFromType(["cjs"]) || !isBooleanFromType(true)) {
  throw new Error("CJS type 子路径导入验证失败。");
}

if (!isPhoneCnFromReg("13800138000") || !isEmailFromReg("reg@example.com")) {
  throw new Error("CJS reg 子路径导入验证失败。");
}

if (typeof isBrowserFromPlatform !== "function" || typeof isNodeFromPlatform !== "function") {
  throw new Error("CJS platform 子路径导入验证失败。");
}
if (!isNodeFromPlatform()) {
  throw new Error("CJS platform 子路径 Node 环境判断验证失败。");
}
if (isBrowserFromPlatform()) {
  throw new Error("CJS platform 子路径浏览器环境判断验证失败。");
}

if (jsonStringifyFromObjectJson({ b: 2, a: 1 }, { sortKeys: true }) !== '{"a":1,"b":2}') {
  throw new Error("CJS object/json 子路径 JSON 序列化验证失败。");
}

if (jsonParseFromObjectJson('{"a":1}').a !== 1) {
  throw new Error("CJS object/json 子路径 JSON 反序列化验证失败。");
}

// Safe 版本：正常输入返回原值，异常输入返回 null
if (jsonStringifySafeFromObjectJson({ a: 1 }) !== '{"a":1}') {
  throw new Error("CJS object/json 子路径 jsonStringifySafe 验证失败。");
}
// 循环引用会让原生 JSON.stringify 抛 TypeError，Safe 版本应返回 null
const cyclic = { a: 1 };
cyclic.self = cyclic;
if (jsonStringifySafeFromObjectJson(cyclic) !== null) {
  throw new Error("CJS object/json 子路径 jsonStringifySafe 循环引用返回非 null 预期失败。");
}
if (jsonParseSafeFromObjectJson('{"a":1}').a !== 1) {
  throw new Error("CJS object/json 子路径 jsonParseSafe 正常输入验证失败。");
}
if (jsonParseSafeFromObjectJson("{invalid}") !== null) {
  throw new Error("CJS object/json 子路径 jsonParseSafe 非法输入返回非 null 预期失败。");
}
