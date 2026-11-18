import { strict as assert } from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const [order, ...names] = process.argv.slice(2);
for (const name of names) {
  const first = order === "esm" ? await import(name) : require(name);
  const second = order === "esm" ? require(name) : await import(name);
  assert.deepEqual(Object.keys(first).sort(), Object.keys(second).sort(), name);
  if (name === "@axutils/common/date") {
    // date-fns 的默认配置按模块格式隔离，日期入口须使用与调用方相同的 peer。
    const esm = await import(name);
    const cjs = require(name);
    const { fr } = await import("date-fns/locale/fr");
    const { de } = require("date-fns/locale/de");
    (await import("date-fns")).setDefaultOptions({ locale: fr });
    require("date-fns").setDefaultOptions({ locale: de });
    assert.equal(esm.PlainDate.format("2024-01-01", "MMMM"), "janvier");
    assert.equal(cjs.PlainDate.format("2024-01-01", "MMMM"), "Januar");
  } else {
    for (const key of Object.keys(first)) assert.equal(first[key], second[key], `${name}.${key}`);
  }
}

// 同时跨公开路径和加载器读写，分别检验通用 JSON 值语义与 Node 引用语义。
if (names.includes("@axutils/common")) {
  for (const [root, subpath, byReference] of [
    ["@axutils/common", "@axutils/common/object/storage", false],
    ["@axutils/common/node", "@axutils/common/node/object/storage", true],
  ]) {
    const { StorageUtils } = await import(root);
    const other = new (require(subpath).StorageUtils)({ prefix: "mixed:" });
    assert.ok(other instanceof StorageUtils);
    const store = new StorageUtils({ prefix: "mixed:" });
    const value = { count: 1 };
    store.set("key", value);
    const read = other.get("key");
    assert.deepEqual(read, value);
    assert.equal(read === value, byReference);
    other.remove("key");
    assert.equal(store.get("key"), null);
  }
}

for (const name of names.filter((entry) => entry.endsWith("/http"))) {
  const axios = require("axios");
  let calls = 0;
  const axiosInstance = axios.create({
    adapter: async (config) => {
      if (++calls === 1) throw new axios.AxiosError("retry", "ERR_NETWORK", config);
      return { config, data: "ok", headers: {}, status: 200, statusText: "OK" };
    },
  });
  const api = order === "esm" ? await import(name) : require(name);
  const Client = api.PromiseHttpClient ?? api.RxHttpClient;
  const client = new Client({ axiosInstance, dedupe: true, retryCount: 2, retryDelay: 0 });
  const send = () => {
    const result = client.get("/packed");
    return api.RxHttpClient ? require("rxjs").firstValueFrom(result) : result;
  };
  const results = await Promise.all([send(), send()]);
  assert.deepEqual(
    results.map((result) => result.data),
    ["ok", "ok"],
  );
  assert.equal(calls, 2, `${name} 应共享首次发送及一次重试`);
}

if (names.includes("@axutils/common/object/json")) {
  const json = await import("@axutils/common/object/json");
  const value = {};
  value.self = value;
  assert.throws(
    () => json.jsonStringify(value, { sortKeys: true }),
    require("@axutils/common/object/json").JsonCircularReferenceError,
  );
}
