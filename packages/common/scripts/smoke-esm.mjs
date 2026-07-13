import {
  StorageUtils as CommonStorageUtils,
  debounce as debounceFromEntry,
  deepClone as deepCloneFromEntry,
  isEmail as isEmailFromEntry,
  isNumber as isNumberFromEntry,
  objectToQuery as objectToQueryFromEntry,
  queryToObject as queryToObjectFromEntry,
  throttle as throttleFromEntry,
} from "@axutils/common";
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
  binaryStringToBytes as binaryStringToBytesFromCryptoConvert,
  bytesToBase64 as bytesToBase64FromCryptoConvert,
  bytesToHex as bytesToHexFromCryptoConvert,
  decodeBase64 as decodeBase64FromCryptoConvert,
  decodeHex as decodeHexFromCryptoConvert,
  normalizeMd5Input as normalizeMd5InputFromCryptoConvert,
} from "@axutils/common/crypto/convert";
import { Md5 as Md5FromCryptoPath } from "@axutils/common/crypto/md5";
import { Md5 as Md5FromNodeEntry } from "@axutils/common/node";
import {
  binaryStringToBytes as binaryStringToBytesFromNodeCryptoConvert,
  bytesToBase64 as bytesToBase64FromNodeCryptoConvert,
  bytesToHex as bytesToHexFromNodeCryptoConvert,
  decodeBase64 as decodeBase64FromNodeCryptoConvert,
  decodeHex as decodeHexFromNodeCryptoConvert,
  normalizeMd5Input as normalizeMd5InputFromNodeCryptoConvert,
} from "@axutils/common/node/crypto/convert";
import { Md5 as Md5FromNodeCryptoPath } from "@axutils/common/node/crypto/md5";
import { StorageUtils as NodeStorageUtils } from "@axutils/common/node/object/storage";
import {
  jsonParse as jsonParseFromObjectJson,
  jsonParseSafe as jsonParseSafeFromObjectJson,
  jsonStringify as jsonStringifyFromObjectJson,
  jsonStringifySafe as jsonStringifySafeFromObjectJson,
} from "@axutils/common/object/json";
import { deepClone as deepCloneFromPath } from "@axutils/common/object/object";
import { StorageUtils as BrowserStorageUtils } from "@axutils/common/object/storage";
import {
  debounce as debounceFromPath,
  throttle as throttleFromPath,
} from "@axutils/common/object/timing";
import { objectToQuery, queryToObject } from "@axutils/common/object/url";
import {
  HttpRequestError as HttpRequestErrorFromRxjs,
  RxHttpClient as RxHttpClientFromRxjs,
} from "@axutils/common/rxjs/http";

if (typeof RxHttpClientFromRxjs !== "function" || typeof HttpRequestErrorFromRxjs !== "function") {
  throw new Error("ESM rxjs/http 子路径导出验证失败。");
}

if (!isNumberFromEntry(1) || isNumberFromEntry(NaN)) {
  throw new Error("ESM 主入口类型判断验证失败。");
}

if (!isEmailFromEntry("esm@example.com")) {
  throw new Error("ESM 主入口正则判断验证失败。");
}
if (objectToQueryFromEntry({ tag: ["esm", "entry"] }) !== "tag=esm&tag=entry") {
  throw new Error("ESM 主入口 URL 查询序列化验证失败。");
}
if (JSON.stringify(queryToObjectFromEntry("?tag=esm&tag=entry")) !== '{"tag":["esm","entry"]}') {
  throw new Error("ESM 主入口 URL 查询解析验证失败。");
}
if (
  typeof debounceFromEntry !== "function" ||
  typeof throttleFromEntry !== "function" ||
  typeof deepCloneFromEntry !== "function"
) {
  throw new Error("ESM 主入口对象工具导出验证失败。");
}
if (debounceFromEntry !== debounceFromPath || throttleFromEntry !== throttleFromPath) {
  throw new Error("ESM 对象工具子路径与主入口导出不一致。");
}
const esmCloneSource = { nested: { value: 1 } };
const esmClone = deepCloneFromEntry(esmCloneSource);
if (esmClone === esmCloneSource || esmClone.nested === esmCloneSource.nested) {
  throw new Error("ESM 主入口 deepClone 验证失败。");
}
if (deepCloneFromEntry !== deepCloneFromPath) {
  throw new Error("ESM deepClone 子路径与主入口导出不一致。");
}
if (throttleFromEntry(() => "esm", 0)() !== "esm") {
  throw new Error("ESM throttle 调用验证失败。");
}
const esmDebounced = debounceFromEntry(() => {}, 0);
if (typeof esmDebounced.cancel !== "function") {
  throw new Error("ESM debounce cancel 验证失败。");
}
esmDebounced.cancel();

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

if (objectToQuery({ tag: ["esm", "url"], empty: null }) !== "tag=esm&tag=url") {
  throw new Error("ESM object/url 子路径序列化验证失败。");
}
if (
  JSON.stringify(queryToObject("https://example.com/?tag=esm&tag=url")) !== '{"tag":["esm","url"]}'
) {
  throw new Error("ESM object/url 子路径解析验证失败。");
}

const browserStorage = new BrowserStorageUtils({ prefix: "smoke-esm-" });
browserStorage.set("key", "value");
if (browserStorage.get("key") !== "value") {
  throw new Error("ESM object/storage 子路径读写验证失败。");
}

const commonStorage = new CommonStorageUtils({ prefix: "smoke-esm-common-" });
commonStorage.set("key", "value");
if (commonStorage.get("key") !== "value") {
  throw new Error("ESM 主入口 storage 读写验证失败。");
}

const nodeStorage = new NodeStorageUtils({ prefix: "smoke-esm-node-" });
nodeStorage.set("key", "value");
if (nodeStorage.get("key") !== "value") {
  throw new Error("ESM node/object/storage 子路径读写验证失败。");
}

if ("Md5" in (await import("@axutils/common"))) {
  throw new Error("ESM 主入口不应导出 Md5。");
}

const bytes = new Uint8Array([
  93, 65, 64, 42, 188, 75, 42, 118, 185, 113, 157, 145, 16, 23, 197, 146,
]);

if (new Md5FromCryptoPath().update("hello").toHex() !== "5d41402abc4b2a76b9719d911017c592") {
  throw new Error("ESM crypto/md5 子路径 MD5 摘要验证失败。");
}

if (bytesToHexFromCryptoConvert(bytes) !== "5d41402abc4b2a76b9719d911017c592") {
  throw new Error("ESM crypto/convert bytesToHex 验证失败。");
}

if (bytesToBase64FromCryptoConvert(bytes) !== "XUFAKrxLKna5cZ2REBfFkg==") {
  throw new Error("ESM crypto/convert bytesToBase64 验证失败。");
}

if (binaryStringToBytesFromCryptoConvert("\x5dA").join(",") !== "93,65") {
  throw new Error("ESM crypto/convert binaryStringToBytes 验证失败。");
}

if (decodeHexFromCryptoConvert("68656c6c6f").join(",") !== "104,101,108,108,111") {
  throw new Error("ESM crypto/convert decodeHex 验证失败。");
}

if (decodeBase64FromCryptoConvert("aGVsbG8=").join(",") !== "104,101,108,108,111") {
  throw new Error("ESM crypto/convert decodeBase64 验证失败。");
}

if (normalizeMd5InputFromCryptoConvert("hello").join(",") !== "104,101,108,108,111") {
  throw new Error("ESM crypto/convert normalizeMd5Input 验证失败。");
}

if (new Md5FromNodeEntry().update("hello").toBase64() !== "XUFAKrxLKna5cZ2REBfFkg==") {
  throw new Error("ESM node 子路径聚合导出验证失败。");
}

if (new Md5FromNodeCryptoPath().update("hello").toHex() !== "5d41402abc4b2a76b9719d911017c592") {
  throw new Error("ESM node/crypto/md5 子路径验证失败。");
}

if (bytesToHexFromNodeCryptoConvert(bytes) !== "5d41402abc4b2a76b9719d911017c592") {
  throw new Error("ESM node/crypto/convert bytesToHex 验证失败。");
}

if (bytesToBase64FromNodeCryptoConvert(bytes) !== "XUFAKrxLKna5cZ2REBfFkg==") {
  throw new Error("ESM node/crypto/convert bytesToBase64 验证失败。");
}

if (binaryStringToBytesFromNodeCryptoConvert("\x5dA").join(",") !== "93,65") {
  throw new Error("ESM node/crypto/convert binaryStringToBytes 验证失败。");
}

if (decodeHexFromNodeCryptoConvert("68656c6c6f").join(",") !== "104,101,108,108,111") {
  throw new Error("ESM node/crypto/convert decodeHex 验证失败。");
}

if (decodeBase64FromNodeCryptoConvert("aGVsbG8=").join(",") !== "104,101,108,108,111") {
  throw new Error("ESM node/crypto/convert decodeBase64 验证失败。");
}

if (normalizeMd5InputFromNodeCryptoConvert("hello").join(",") !== "104,101,108,108,111") {
  throw new Error("ESM node/crypto/convert normalizeMd5Input 验证失败。");
}
