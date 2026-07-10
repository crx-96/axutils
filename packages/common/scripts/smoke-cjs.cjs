const {
  isEmail: isEmailFromEntry,
  isNumber: isNumberFromEntry,
  objectToQuery: objectToQueryFromEntry,
  queryToObject: queryToObjectFromEntry,
} = require("@axutils/common");
const {
  isEmail: isEmailFromReg,
  isPhoneCn: isPhoneCnFromReg,
} = require("@axutils/common/check/reg");
const {
  isBrowser: isBrowserFromPlatform,
  isNode: isNodeFromPlatform,
} = require("@axutils/common/check/platform");
const {
  binaryStringToBytes: binaryStringToBytesFromCryptoConvert,
  bytesToBase64: bytesToBase64FromCryptoConvert,
  bytesToHex: bytesToHexFromCryptoConvert,
  decodeBase64: decodeBase64FromCryptoConvert,
  decodeHex: decodeHexFromCryptoConvert,
  normalizeMd5Input: normalizeMd5InputFromCryptoConvert,
} = require("@axutils/common/crypto/convert");
const { Md5: Md5FromCryptoPath } = require("@axutils/common/crypto/md5");
const { Md5: Md5FromNodeEntry } = require("@axutils/common/node");
const {
  binaryStringToBytes: binaryStringToBytesFromNodeCryptoConvert,
  bytesToBase64: bytesToBase64FromNodeCryptoConvert,
  bytesToHex: bytesToHexFromNodeCryptoConvert,
  decodeBase64: decodeBase64FromNodeCryptoConvert,
  decodeHex: decodeHexFromNodeCryptoConvert,
  normalizeMd5Input: normalizeMd5InputFromNodeCryptoConvert,
} = require("@axutils/common/node/crypto/convert");
const { Md5: Md5FromNodeCryptoPath } = require("@axutils/common/node/crypto/md5");
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
const { objectToQuery, queryToObject } = require("@axutils/common/object/url");

if (!isNumberFromEntry(1) || isNumberFromEntry(NaN)) {
  throw new Error("CJS 主入口类型判断验证失败。");
}

if (!isEmailFromEntry("cjs@example.com")) {
  throw new Error("CJS 主入口正则判断验证失败。");
}
if (objectToQueryFromEntry({ tag: ["cjs", "entry"] }) !== "tag=cjs&tag=entry") {
  throw new Error("CJS 主入口 URL 查询序列化验证失败。");
}
if (JSON.stringify(queryToObjectFromEntry("?tag=cjs&tag=entry")) !== '{"tag":["cjs","entry"]}') {
  throw new Error("CJS 主入口 URL 查询解析验证失败。");
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

if (objectToQuery({ tag: ["cjs", "url"], empty: null }) !== "tag=cjs&tag=url") {
  throw new Error("CJS object/url 子路径序列化验证失败。");
}
if (
  JSON.stringify(queryToObject("https://example.com/?tag=cjs&tag=url")) !== '{"tag":["cjs","url"]}'
) {
  throw new Error("CJS object/url 子路径解析验证失败。");
}

if ("Md5" in require("@axutils/common")) {
  throw new Error("CJS 主入口不应导出 Md5。");
}

const bytes = new Uint8Array([
  93, 65, 64, 42, 188, 75, 42, 118, 185, 113, 157, 145, 16, 23, 197, 146,
]);

if (new Md5FromCryptoPath().update("hello").toHex() !== "5d41402abc4b2a76b9719d911017c592") {
  throw new Error("CJS crypto/md5 子路径 MD5 摘要验证失败。");
}

if (bytesToHexFromCryptoConvert(bytes) !== "5d41402abc4b2a76b9719d911017c592") {
  throw new Error("CJS crypto/convert bytesToHex 子路径验证失败。");
}

if (bytesToBase64FromCryptoConvert(bytes) !== "XUFAKrxLKna5cZ2REBfFkg==") {
  throw new Error("CJS crypto/convert bytesToBase64 子路径验证失败。");
}

if (binaryStringToBytesFromCryptoConvert("\x5dA").join(",") !== "93,65") {
  throw new Error("CJS crypto/convert binaryStringToBytes 验证失败。");
}

if (decodeHexFromCryptoConvert("68656c6c6f").join(",") !== "104,101,108,108,111") {
  throw new Error("CJS crypto/convert decodeHex 验证失败。");
}

if (decodeBase64FromCryptoConvert("aGVsbG8=").join(",") !== "104,101,108,108,111") {
  throw new Error("CJS crypto/convert decodeBase64 验证失败。");
}

if (normalizeMd5InputFromCryptoConvert("hello").join(",") !== "104,101,108,108,111") {
  throw new Error("CJS crypto/convert normalizeMd5Input 验证失败。");
}

if (new Md5FromNodeEntry().update("hello").toBase64() !== "XUFAKrxLKna5cZ2REBfFkg==") {
  throw new Error("CJS node 子路径聚合导出验证失败。");
}

if (new Md5FromNodeCryptoPath().update("hello").toHex() !== "5d41402abc4b2a76b9719d911017c592") {
  throw new Error("CJS node/crypto/md5 子路径验证失败。");
}

if (bytesToHexFromNodeCryptoConvert(bytes) !== "5d41402abc4b2a76b9719d911017c592") {
  throw new Error("CJS node/crypto/convert bytesToHex 验证失败。");
}

if (bytesToBase64FromNodeCryptoConvert(bytes) !== "XUFAKrxLKna5cZ2REBfFkg==") {
  throw new Error("CJS node/crypto/convert bytesToBase64 验证失败。");
}

if (binaryStringToBytesFromNodeCryptoConvert("\x5dA").join(",") !== "93,65") {
  throw new Error("CJS node/crypto/convert binaryStringToBytes 验证失败。");
}

if (decodeHexFromNodeCryptoConvert("68656c6c6f").join(",") !== "104,101,108,108,111") {
  throw new Error("CJS node/crypto/convert decodeHex 验证失败。");
}

if (decodeBase64FromNodeCryptoConvert("aGVsbG8=").join(",") !== "104,101,108,108,111") {
  throw new Error("CJS node/crypto/convert decodeBase64 验证失败。");
}

if (normalizeMd5InputFromNodeCryptoConvert("hello").join(",") !== "104,101,108,108,111") {
  throw new Error("CJS node/crypto/convert normalizeMd5Input 验证失败。");
}
