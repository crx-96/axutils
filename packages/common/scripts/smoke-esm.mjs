import { isEmail as isEmailFromEntry, isNumber as isNumberFromEntry } from "@axutils/common";
import {
  isBrowser as isBrowserFromPlatform,
  isNode as isNodeFromPlatform,
} from "@axutils/common/check/platform";
import {
  isEmail as isEmailFromReg,
  isPhoneCn as isPhoneCnFromReg,
} from "@axutils/common/check/reg";
import {
  isArray as isArrayFromType,
  isBoolean as isBooleanFromType,
} from "@axutils/common/check/type";
import {
  jsonParse as jsonParseFromObjectJson,
  jsonParseSafe as jsonParseSafeFromObjectJson,
  jsonStringify as jsonStringifyFromObjectJson,
  jsonStringifySafe as jsonStringifySafeFromObjectJson,
} from "@axutils/common/object/json";

if (!isNumberFromEntry(1) || isNumberFromEntry(NaN)) {
  throw new Error("ESM 主入口类型判断验证失败。");
}

if (!isEmailFromEntry("esm@example.com")) {
  throw new Error("ESM 主入口正则判断验证失败。");
}

if (!isArrayFromType(["esm"]) || !isBooleanFromType(true)) {
  throw new Error("ESM type 子路径导入验证失败。");
}

if (!isPhoneCnFromReg("13800138000") || !isEmailFromReg("reg@example.com")) {
  throw new Error("ESM reg 子路径导入验证失败。");
}

if (typeof isBrowserFromPlatform !== "function" || typeof isNodeFromPlatform !== "function") {
  throw new Error("ESM platform 子路径导入验证失败。");
}
if (!isNodeFromPlatform()) {
  throw new Error("ESM platform 子路径 Node 环境判断验证失败。");
}
if (isBrowserFromPlatform()) {
  throw new Error("ESM platform 子路径浏览器环境判断验证失败。");
}

if (jsonStringifyFromObjectJson({ b: 2, a: 1 }, { sortKeys: true }) !== '{"a":1,"b":2}') {
  throw new Error("ESM object/json 子路径 JSON 序列化验证失败。");
}

if (jsonParseFromObjectJson('{"a":1}').a !== 1) {
  throw new Error("ESM object/json 子路径 JSON 反序列化验证失败。");
}

// Safe 版本：正常输入返回原值，异常输入返回 null
if (jsonStringifySafeFromObjectJson({ a: 1 }) !== '{"a":1}') {
  throw new Error("ESM object/json 子路径 jsonStringifySafe 验证失败。");
}
// 循环引用会让原生 JSON.stringify 抛 TypeError，Safe 版本应返回 null
const cyclic = { a: 1 };
cyclic.self = cyclic;
if (jsonStringifySafeFromObjectJson(cyclic) !== null) {
  throw new Error("ESM object/json 子路径 jsonStringifySafe 循环引用返回非 null 预期失败。");
}
if (jsonParseSafeFromObjectJson('{"a":1}').a !== 1) {
  throw new Error("ESM object/json 子路径 jsonParseSafe 正常输入验证失败。");
}
if (jsonParseSafeFromObjectJson("{invalid}") !== null) {
  throw new Error("ESM object/json 子路径 jsonParseSafe 非法输入返回非 null 预期失败。");
}
