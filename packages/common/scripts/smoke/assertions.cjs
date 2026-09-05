const assert = require("node:assert").strict;
const expected = require("./exports.json");

/** 两种模块加载器运行同一组行为契约，避免格式之间漏测或漂移。 */
module.exports = function verify(modules) {
  assert.deepEqual(
    Object.keys(modules).sort(),
    Object.keys(expected)
      .map((key) => (key === "." ? "@axutils/common" : `@axutils/common${key.slice(1)}`))
      .sort(),
  );
  for (const [key, names] of Object.entries(expected)) {
    const name = key === "." ? "@axutils/common" : `@axutils/common${key.slice(1)}`;
    assert.deepEqual(Object.keys(modules[name]).sort(), names, `${name} 导出契约`);
  }
  const {
    StorageUtils: CommonStorageUtils,
    debounce: debounceFromEntry,
    deepClone: deepCloneFromEntry,
    isEmail: isEmailFromEntry,
    isNumber: isNumberFromEntry,
    objectToQuery: objectToQueryFromEntry,
    queryToObject: queryToObjectFromEntry,
    throttle: throttleFromEntry,
  } = modules["@axutils/common"];
  const {
    PromiseHttpClient: PromiseHttpClientFromAxios,
    PromiseHttpRequestError: PromiseHttpRequestErrorFromAxios,
  } = modules["@axutils/common/axios/http"];
  const { isBrowser: isBrowserFromPlatform, isNode: isNodeFromPlatform } =
    modules["@axutils/common/check/platform"];
  const { isEmail: isEmailFromReg, isPhoneCn: isPhoneCnFromReg } =
    modules["@axutils/common/check/reg"];
  const { isArray: isArrayFromType, isBoolean: isBooleanFromType } =
    modules["@axutils/common/check/type"];
  const {
    binaryStringToBytes: binaryStringToBytesFromCryptoConvert,
    bytesToBase64: bytesToBase64FromCryptoConvert,
    bytesToHex: bytesToHexFromCryptoConvert,
    decodeBase64: decodeBase64FromCryptoConvert,
    decodeHex: decodeHexFromCryptoConvert,
    normalizeMd5Input: normalizeMd5InputFromCryptoConvert,
  } = modules["@axutils/common/crypto/convert"];
  const { Md5: Md5FromCryptoPath } = modules["@axutils/common/crypto/md5"];
  const { Md5: Md5FromNodeEntry } = modules["@axutils/common/node"];
  const {
    binaryStringToBytes: binaryStringToBytesFromNodeCryptoConvert,
    bytesToBase64: bytesToBase64FromNodeCryptoConvert,
    bytesToHex: bytesToHexFromNodeCryptoConvert,
    decodeBase64: decodeBase64FromNodeCryptoConvert,
    decodeHex: decodeHexFromNodeCryptoConvert,
    normalizeMd5Input: normalizeMd5InputFromNodeCryptoConvert,
  } = modules["@axutils/common/node/crypto/convert"];
  const { Md5: Md5FromNodeCryptoPath } = modules["@axutils/common/node/crypto/md5"];
  const { StorageUtils: NodeStorageUtils } = modules["@axutils/common/node/object/storage"];
  const {
    jsonParse: jsonParseFromObjectJson,
    jsonParseSafe: jsonParseSafeFromObjectJson,
    jsonStringify: jsonStringifyFromObjectJson,
    jsonStringifySafe: jsonStringifySafeFromObjectJson,
  } = modules["@axutils/common/object/json"];
  const { deepClone: deepCloneFromPath } = modules["@axutils/common/object/object"];
  const { StorageUtils: BrowserStorageUtils } = modules["@axutils/common/object/storage"];
  const { debounce: debounceFromPath, throttle: throttleFromPath } =
    modules["@axutils/common/object/timing"];
  const { objectToQuery, queryToObject } = modules["@axutils/common/object/url"];
  const { HttpRequestError: HttpRequestErrorFromRxjs, RxHttpClient: RxHttpClientFromRxjs } =
    modules["@axutils/common/rxjs/http"];
  if (
    typeof RxHttpClientFromRxjs !== "function" ||
    typeof HttpRequestErrorFromRxjs !== "function"
  ) {
    throw new Error("产物 rxjs/http 子路径导出验证失败。");
  }
  if (
    typeof PromiseHttpClientFromAxios !== "function" ||
    typeof PromiseHttpRequestErrorFromAxios !== "function"
  ) {
    throw new Error("产物 axios/http 子路径导出验证失败。");
  }

  if (!isNumberFromEntry(1) || isNumberFromEntry(NaN)) {
    throw new Error("产物 主入口类型判断验证失败。");
  }

  if (!isEmailFromEntry("esm@example.com")) {
    throw new Error("产物 主入口正则判断验证失败。");
  }
  if (objectToQueryFromEntry({ tag: ["esm", "entry"] }) !== "tag=esm&tag=entry") {
    throw new Error("产物 主入口 URL 查询序列化验证失败。");
  }
  if (JSON.stringify(queryToObjectFromEntry("?tag=esm&tag=entry")) !== '{"tag":["esm","entry"]}') {
    throw new Error("产物 主入口 URL 查询解析验证失败。");
  }
  if (
    typeof debounceFromEntry !== "function" ||
    typeof throttleFromEntry !== "function" ||
    typeof deepCloneFromEntry !== "function"
  ) {
    throw new Error("产物 主入口对象工具导出验证失败。");
  }
  if (debounceFromEntry !== debounceFromPath || throttleFromEntry !== throttleFromPath) {
    throw new Error("产物 对象工具子路径与主入口导出不一致。");
  }
  const esmCloneSource = { nested: { value: 1 } };
  const esmClone = deepCloneFromEntry(esmCloneSource);
  if (esmClone === esmCloneSource || esmClone.nested === esmCloneSource.nested) {
    throw new Error("产物 主入口 deepClone 验证失败。");
  }
  if (deepCloneFromEntry !== deepCloneFromPath) {
    throw new Error("产物 deepClone 子路径与主入口导出不一致。");
  }
  if (throttleFromEntry(() => "esm", 0)() !== "esm") {
    throw new Error("产物 throttle 调用验证失败。");
  }
  const esmDebounced = debounceFromEntry(() => {}, 0);
  if (typeof esmDebounced.cancel !== "function") {
    throw new Error("产物 debounce cancel 验证失败。");
  }
  esmDebounced.cancel();

  if (!isArrayFromType(["esm"]) || !isBooleanFromType(true)) {
    throw new Error("产物 type 子路径导入验证失败。");
  }

  if (!isPhoneCnFromReg("13800138000") || !isEmailFromReg("reg@example.com")) {
    throw new Error("产物 reg 子路径导入验证失败。");
  }

  if (typeof isBrowserFromPlatform !== "function" || typeof isNodeFromPlatform !== "function") {
    throw new Error("产物 platform 子路径导入验证失败。");
  }
  if (!isNodeFromPlatform()) {
    throw new Error("产物 platform 子路径 Node 环境判断验证失败。");
  }
  if (isBrowserFromPlatform()) {
    throw new Error("产物 platform 子路径浏览器环境判断验证失败。");
  }

  // biome-ignore assist/source/useSortedKeys: 故意保留非排序输入，验证键顺序处理且不弱化回归覆盖。
  if (jsonStringifyFromObjectJson({ b: 2, a: 1 }, { sortKeys: true }) !== '{"a":1,"b":2}') {
    throw new Error("产物 object/json 子路径 JSON 序列化验证失败。");
  }

  if (jsonParseFromObjectJson('{"a":1}').a !== 1) {
    throw new Error("产物 object/json 子路径 JSON 反序列化验证失败。");
  }

  // Safe 版本：正常输入返回原值，异常输入返回 null
  if (jsonStringifySafeFromObjectJson({ a: 1 }) !== '{"a":1}') {
    throw new Error("产物 object/json 子路径 jsonStringifySafe 验证失败。");
  }
  // 循环引用会让原生 JSON.stringify 抛 TypeError，Safe 版本应返回 null
  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  if (jsonStringifySafeFromObjectJson(cyclic) !== null) {
    throw new Error("产物 object/json 子路径 jsonStringifySafe 循环引用返回非 null 预期失败。");
  }
  if (jsonParseSafeFromObjectJson('{"a":1}').a !== 1) {
    throw new Error("产物 object/json 子路径 jsonParseSafe 正常输入验证失败。");
  }
  if (jsonParseSafeFromObjectJson("{invalid}") !== null) {
    throw new Error("产物 object/json 子路径 jsonParseSafe 非法输入返回非 null 预期失败。");
  }

  if (objectToQuery({ empty: null, tag: ["esm", "url"] }) !== "tag=esm&tag=url") {
    throw new Error("产物 object/url 子路径序列化验证失败。");
  }
  if (
    JSON.stringify(queryToObject("https://example.com/?tag=esm&tag=url")) !==
    '{"tag":["esm","url"]}'
  ) {
    throw new Error("产物 object/url 子路径解析验证失败。");
  }

  const browserStorage = new BrowserStorageUtils({ prefix: "smoke-esm-" });
  browserStorage.set("key", "value");
  if (browserStorage.get("key") !== "value") {
    throw new Error("产物 object/storage 子路径读写验证失败。");
  }

  const commonStorage = new CommonStorageUtils({ prefix: "smoke-esm-common-" });
  commonStorage.set("key", "value");
  if (commonStorage.get("key") !== "value") {
    throw new Error("产物 主入口 storage 读写验证失败。");
  }

  const nodeStorage = new NodeStorageUtils({ prefix: "smoke-esm-node-" });
  nodeStorage.set("key", "value");
  if (nodeStorage.get("key") !== "value") {
    throw new Error("产物 node/object/storage 子路径读写验证失败。");
  }

  if ("Md5" in modules["@axutils/common"]) {
    throw new Error("产物 主入口不应导出 Md5。");
  }

  const bytes = new Uint8Array([
    93, 65, 64, 42, 188, 75, 42, 118, 185, 113, 157, 145, 16, 23, 197, 146,
  ]);

  if (new Md5FromCryptoPath().update("hello").toHex() !== "5d41402abc4b2a76b9719d911017c592") {
    throw new Error("产物 crypto/md5 子路径 MD5 摘要验证失败。");
  }

  if (bytesToHexFromCryptoConvert(bytes) !== "5d41402abc4b2a76b9719d911017c592") {
    throw new Error("产物 crypto/convert bytesToHex 验证失败。");
  }

  if (bytesToBase64FromCryptoConvert(bytes) !== "XUFAKrxLKna5cZ2REBfFkg==") {
    throw new Error("产物 crypto/convert bytesToBase64 验证失败。");
  }

  if (binaryStringToBytesFromCryptoConvert("\x5dA").join(",") !== "93,65") {
    throw new Error("产物 crypto/convert binaryStringToBytes 验证失败。");
  }

  if (decodeHexFromCryptoConvert("68656c6c6f").join(",") !== "104,101,108,108,111") {
    throw new Error("产物 crypto/convert decodeHex 验证失败。");
  }

  if (decodeBase64FromCryptoConvert("aGVsbG8=").join(",") !== "104,101,108,108,111") {
    throw new Error("产物 crypto/convert decodeBase64 验证失败。");
  }

  if (normalizeMd5InputFromCryptoConvert("hello").join(",") !== "104,101,108,108,111") {
    throw new Error("产物 crypto/convert normalizeMd5Input 验证失败。");
  }

  if (new Md5FromNodeEntry().update("hello").toBase64() !== "XUFAKrxLKna5cZ2REBfFkg==") {
    throw new Error("产物 node 子路径聚合导出验证失败。");
  }

  if (new Md5FromNodeCryptoPath().update("hello").toHex() !== "5d41402abc4b2a76b9719d911017c592") {
    throw new Error("产物 node/crypto/md5 子路径验证失败。");
  }

  if (bytesToHexFromNodeCryptoConvert(bytes) !== "5d41402abc4b2a76b9719d911017c592") {
    throw new Error("产物 node/crypto/convert bytesToHex 验证失败。");
  }

  if (bytesToBase64FromNodeCryptoConvert(bytes) !== "XUFAKrxLKna5cZ2REBfFkg==") {
    throw new Error("产物 node/crypto/convert bytesToBase64 验证失败。");
  }

  if (binaryStringToBytesFromNodeCryptoConvert("\x5dA").join(",") !== "93,65") {
    throw new Error("产物 node/crypto/convert binaryStringToBytes 验证失败。");
  }

  if (decodeHexFromNodeCryptoConvert("68656c6c6f").join(",") !== "104,101,108,108,111") {
    throw new Error("产物 node/crypto/convert decodeHex 验证失败。");
  }

  if (decodeBase64FromNodeCryptoConvert("aGVsbG8=").join(",") !== "104,101,108,108,111") {
    throw new Error("产物 node/crypto/convert decodeBase64 验证失败。");
  }

  if (normalizeMd5InputFromNodeCryptoConvert("hello").join(",") !== "104,101,108,108,111") {
    throw new Error("产物 node/crypto/convert normalizeMd5Input 验证失败。");
  }

  const { Instant, PlainDate } = modules["@axutils/common/date"];
  assert.equal(Instant.from("2024-01-01T00:00:00Z"), 1704067200000);
  assert.equal(PlainDate.of(2024, 2, 29).toISOString(), "2024-02-29T00:00:00.000Z");
};
