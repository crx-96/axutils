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
