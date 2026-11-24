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
  } else if (name === "@axutils/common/axios/http" || name === "@axutils/common/rxjs/http") {
    // axios 按模块格式各自独立，HTTP 入口须直接加载与调用方同格式的实现。
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
  const api = order === "esm" ? await import(name) : require(name);
  const axiosModule = order === "esm" ? await import("axios") : require("axios");
  const axios = order === "esm" ? axiosModule.default : axiosModule;
  const { AxiosError, AxiosHeaders } = axiosModule;
  const rxjs = api.RxHttpClient
    ? order === "esm"
      ? await import("rxjs")
      : require("rxjs")
    : undefined;
  const Client = api.PromiseHttpClient ?? api.RxHttpClient;
  // 默认构造必须共享当前模块格式的 axios 默认实例。
  assert.equal(new Client().axiosInstance, axios, `${name} 应共享同格式 axios 默认实例`);

  let calls = 0;
  let receivedTestHeader;
  const axiosInstance = axios.create({
    adapter: async (config) => {
      receivedTestHeader = config.headers.get("X-Test");
      if (++calls === 1) throw new AxiosError("retry", "ERR_NETWORK", config);
      return { config, data: "ok", headers: {}, status: 200, statusText: "OK" };
    },
  });
  const client = new Client({
    axiosInstance,
    dedupe: true,
    retryCount: 2,
    retryDelay: 0,
    transformHeaders: (headers) => new AxiosHeaders({ ...headers, "X-Test": "1" }),
  });
  const send = (target = client, url = "/packed", options) => {
    const result = target.get(url, options);
    return rxjs ? rxjs.firstValueFrom(result) : result;
  };
  const results = await Promise.all([send(), send()]);
  assert.deepEqual(
    results.map((result) => result.data),
    ["ok", "ok"],
  );
  assert.equal(calls, 2, `${name} 应共享首次发送及一次重试`);
  assert.equal(receivedTestHeader, "1", `${name} 应接受同格式 AxiosHeaders 返回值并透传到 adapter`);

  // 验证同格式 AxiosError 经包装后 cause 仍满足 instanceof AxiosError。
  const errorInstance = axios.create({
    adapter: async (config) => {
      throw new AxiosError("network boom", "ERR_NETWORK", config);
    },
  });
  const errorClient = new Client({ axiosInstance: errorInstance, retryCount: 1 });
  await assert.rejects(
    () => send(errorClient, "/error"),
    (error) => error?.error?.cause instanceof AxiosError,
    `${name} 错误 cause 应为同格式 AxiosError`,
  );

  // 若宿主支持 AbortController，同时验证取消路径的 cause 属于同格式 AxiosError。
  if (typeof AbortController === "function") {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => send(errorClient, "/cancel", { signal: controller.signal }),
      (error) => error?.error?.kind === "cancel" && error?.error?.cause instanceof AxiosError,
      `${name} 取消错误 cause 应为同格式 AxiosError`,
    );
  }
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
