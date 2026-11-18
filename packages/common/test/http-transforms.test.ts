import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { runInNewContext } from "node:vm";
import { AxiosError, AxiosHeaders, type RawAxiosRequestHeaders } from "axios";
import { type Observable, firstValueFrom, isObservable, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
  PromiseHttpClient,
  type PromiseHttpClientOptions,
  PromiseHttpRequestError,
  type PromiseHttpSuccess,
} from "../src/axios/http.js";
import { HttpRequestError, RxHttpClient } from "../src/rxjs/http.js";
import { createAxiosInstance, response } from "./helpers/http/adapter.js";
import { deferred } from "./helpers/http/deferred.js";

type ClientKind = "Promise" | "RxJS";

/** 仅统一测试的执行入口，保留两客户端自己的请求、共享和错误处理。 */
function createClient(kind: ClientKind, options: PromiseHttpClientOptions, useFactory = false) {
  if (kind === "Promise") {
    return useFactory
      ? PromiseHttpClient.create(() => Promise.resolve({ baseUrl: "/api" }), options)
      : new PromiseHttpClient(options);
  }
  return useFactory
    ? RxHttpClient.create(() => of({ baseUrl: "/api" }), options)
    : new RxHttpClient(options);
}

function resultOf(request: Promise<unknown> | Observable<unknown>): Promise<unknown> {
  return isObservable(request) ? firstValueFrom(request) : request;
}

describe.each<ClientKind>(["Promise", "RxJS"])("%s HTTP 自定义转换", (kind) => {
  const ErrorClass = kind === "Promise" ? PromiseHttpRequestError : HttpRequestError;

  it.each([
    ["common", null],
    ["common", false],
    ["common", undefined],
    ["get", null],
    ["get", false],
    ["get", undefined],
  ] as const)("%s 分组显式为 %s 时不恢复该组默认鉴权头", async (group, value) => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    instance.defaults.headers.common["X-Common"] = "common";
    instance.defaults.headers.get["X-Method"] = "method";
    instance.defaults.headers[group].Authorization = "must-not-send";
    instance.defaults.headers["X-Direct"] = "direct";
    const headers = new AxiosHeaders();
    headers.set(group, value);

    const plain = createClient(kind, { axiosInstance: instance });
    const transformed = createClient(kind, {
      axiosInstance: instance,
      transformHeaders: () => ({ "X-Callback": "callback" }),
    });
    await resultOf(plain.get("/suppressed", { headers }));
    await resultOf(transformed.get("/suppressed-with-transform", { headers }));

    for (const config of context.configs) {
      expect(config.headers.get("Authorization")).toBeUndefined();
      expect(config.headers.get("X-Common")).toBe(group === "common" ? undefined : "common");
      expect(config.headers.get("X-Method")).toBe(group === "get" ? undefined : "method");
      expect(config.headers.get("X-Direct")).toBe("direct");
    }
    expect(context.configs[1]?.headers.get("X-Callback")).toBe("callback");
    expect(instance.defaults.headers[group].Authorization).toBe("must-not-send");
    expect(headers.get(group)).toBe(value);
  });

  it.each([false, true])("构造或 create 同时接入两个处理函数（create=%s）", async (useFactory) => {
    const { context, instance } = createAxiosInstance((config) =>
      response(config, { name: "Ada" }, 201),
    );
    const transformHeaders = vi.fn((headers: RawAxiosRequestHeaders) => ({
      ...headers,
      Authorization: "Bearer shared-token",
    }));
    const transformResponse = vi.fn((value: PromiseHttpSuccess<unknown>) => ({
      payload: value.data,
      status: value.code,
    }));
    const client = createClient(
      kind,
      {
        axiosInstance: instance,
        transformHeaders,
        transformResponse,
      },
      useFactory,
    );

    await expect(resultOf(client.get("/users"))).resolves.toEqual({
      payload: { name: "Ada" },
      status: 201,
    });
    expect(context.configs[0]?.url).toBe(useFactory ? "/api/users" : "/users");
    expect(context.configs[0]?.headers.get("Authorization")).toBe("Bearer shared-token");
    expect(transformHeaders).toHaveBeenCalledOnce();
    expect(transformResponse.mock.calls[0]?.[0]).toEqual({
      code: 201,
      data: { name: "Ada" },
      error: null,
      success: true,
    });
  });

  it("未提供转换函数时保留统一成功结果和原有请求头", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config, [1, 2]));
    const client = createClient(kind, { axiosInstance: instance });

    await expect(
      resultOf(
        client.get("/unchanged", {
          headers: { Authorization: "Bearer request-token" },
        }),
      ),
    ).resolves.toEqual({ code: 200, data: [1, 2], error: null, success: true });
    expect(context.configs[0]?.headers.get("authorization")).toBe("Bearer request-token");
  });

  it("请求头按大小写不敏感规则覆盖转换结果，并保留 false/null 的屏蔽语义", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = createClient(kind, {
      axiosInstance: instance,
      transformHeaders: () => ({
        Authorization: "Bearer shared-token",
        "X-Disabled": "shared-value",
        "X-Null": "shared-value",
        "X-Reenabled": false,
      }),
    });

    await resultOf(
      client.get("/override", {
        headers: {
          authorization: "Bearer request-token",
          "x-disabled": false,
          "x-null": null,
          "x-reenabled": "request-value",
        },
      }),
    );
    const headers = context.configs[0]?.headers;
    expect(headers?.get("Authorization")).toBe("Bearer request-token");
    expect(headers?.get("X-Disabled")).toBe(false);
    expect(headers?.get("X-Null")).toBe(null);
    expect(headers?.get("X-Reenabled")).toBe("request-value");
    expect(headers?.toJSON()).not.toHaveProperty("X-Disabled");
    expect(headers?.toJSON()).not.toHaveProperty("X-Null");
    expect(
      Object.keys(headers ?? {}).filter((name) => name.toLowerCase() === "authorization"),
    ).toHaveLength(1);
  });

  it("回调读取展开后的 common/当前方法头，修改副本不会污染对象或多值数组", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const values = ["one", "two"];
    const headers = {
      common: new AxiosHeaders({ "X-Common": "common", "X-Order": "common" }),
      get: new AxiosHeaders({ "X-Method": "get", "X-Order": "get" }),
      post: new AxiosHeaders({ "X-Other-Method": "post" }),
      "X-Array": values,
      "X-Order": "direct",
    };
    const client = createClient(kind, {
      axiosInstance: instance,
      transformHeaders: (input) => {
        expect(input).toMatchObject({
          "X-Array": ["one", "two"],
          "X-Common": "common",
          "X-Method": "get",
          "X-Order": "direct",
        });
        expect(input).not.toHaveProperty("common");
        expect(input).not.toHaveProperty("X-Other-Method");
        const array = input["X-Array"];
        if (!Array.isArray(array)) throw new Error("回调应收到多值 header 数组");
        array.push("transformed");
        input["X-Order"] = "transformed";
        input["X-Added"] = "added";
        return input;
      },
    });

    await resultOf(client.get("/copy", { headers }));
    expect(values).toEqual(["one", "two"]);
    expect(headers["X-Order"]).toBe("direct");
    expect(headers.common.get("X-Order")).toBe("common");
    expect(headers.get.get("X-Order")).toBe("get");
    expect(headers).not.toHaveProperty("X-Added");
    expect(context.configs[0]?.headers.get("X-Array")).toEqual(["one", "two"]);
    expect(context.configs[0]?.headers.get("X-Order")).toBe("direct");
    expect(context.configs[0]?.headers.get("X-Added")).toBe("added");
    expect(context.configs[0]?.headers.has("X-Other-Method")).toBe(false);
  });

  it("支持 AxiosHeaders 输入和返回值", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const headers = new AxiosHeaders({ Authorization: "request-token" });
    const client = createClient(kind, {
      axiosInstance: instance,
      transformHeaders: () =>
        new AxiosHeaders({
          authorization: "shared-token",
          "x-added": "added",
        }),
    });

    await resultOf(client.get("/axios-headers", { headers }));
    expect(context.configs[0]?.headers.get("authorization")).toBe("request-token");
    expect(context.configs[0]?.headers.get("x-added")).toBe("added");
    expect(headers.has("x-added")).toBe(false);
  });

  it.each([
    undefined,
    "same",
  ])("实例 baseURL 改变后获得各自目标的结果（key=%s）", async (dedupeKey) => {
    const gate = deferred();
    const { instance, started } = createAxiosInstance(async (config) => {
      await gate.promise;
      return response(config, instance.getUri(config));
    });
    const client = createClient(kind, { axiosInstance: instance });
    const options = dedupeKey === undefined ? {} : { dedupeKey };
    instance.defaults.baseURL = "https://one.test";
    const first = resultOf(client.get("/profile", options));
    await started;
    instance.defaults.baseURL = "https://two.test";
    const second = resultOf(client.get("/profile", options));
    gate.resolve();
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { data: "https://one.test/profile" },
      { data: "https://two.test/profile" },
    ]);
  });

  it("请求重试继续使用首次传输的基础地址", async () => {
    const targets: string[] = [];
    const { instance } = createAxiosInstance((config) => {
      targets.push(instance.getUri(config));
      if (targets.length === 1) {
        instance.defaults.baseURL = "/v2";
        throw new AxiosError(
          "unavailable",
          AxiosError.ERR_BAD_RESPONSE,
          config,
          undefined,
          response(config, null, 503),
        );
      }
      return response(config);
    });
    instance.defaults.baseURL = "/v1";
    const client = createClient(kind, { axiosInstance: instance, retryCount: 2, retryDelay: 0 });
    await resultOf(client.get("/report"));
    expect(targets).toEqual(["/v1/report", "/v1/report"]);
  });

  it("默认页码和超时在重试间保持首次值，下一个请求使用新值", async () => {
    const { context, instance } = createAxiosInstance((config, current) => {
      const actual = [instance.getUri(config), config.timeout];
      if (current.calls === 1) {
        instance.defaults.params.page = 2;
        instance.defaults.timeout = 99;
        return response(config, actual, 503);
      }
      return response(config, actual);
    });
    instance.defaults.params = { page: 1 };
    instance.defaults.timeout = 12;
    const client = createClient(kind, { axiosInstance: instance, retryCount: 2, retryDelay: 0 });
    await expect(resultOf(client.get("/items"))).resolves.toMatchObject({
      data: ["/items?page=1", 12],
    });
    await expect(resultOf(client.get("/items"))).resolves.toMatchObject({
      data: ["/items?page=2", 99],
    });
    expect(context.calls).toBe(3);
  });

  it("缺省 baseURL 由原实例拦截器在每次尝试时设置", async () => {
    const { context, instance } = createAxiosInstance((config, current) =>
      response(config, instance.getUri(config), current.calls === 1 ? 503 : 200),
    );
    const bases: Array<string | undefined> = [];
    instance.interceptors.request.use((config) => {
      bases.push(config.baseURL);
      config.baseURL ??= "/api";
      return config;
    });
    const client = createClient(kind, { axiosInstance: instance, retryCount: 2, retryDelay: 0 });
    await expect(resultOf(client.get("/items"))).resolves.toMatchObject({ data: "/api/items" });
    expect(context.calls).toBe(2);
    expect(bases).toEqual([undefined, undefined]);
  });

  it.each([
    "params",
    "nested",
    "baseURL",
    "withCredentials",
    "paramsSerializer",
  ] as const)("默认 %s 无法可靠重放时保留第一次传输错误", async (field) => {
    const failure = new AxiosError("first request failed", AxiosError.ERR_NETWORK);
    const { context, instance } = createAxiosInstance((config) => {
      if (field === "params") instance.defaults.params = { extra: 2 };
      if (field === "nested") instance.defaults.params.filter.extra = 2;
      if (field === "baseURL") instance.defaults.baseURL = "/new";
      if (field === "withCredentials") instance.defaults.withCredentials = true;
      throw Object.assign(failure, { config });
    });
    if (field === "nested") instance.defaults.params = { filter: { page: 1 } };
    if (field === "paramsSerializer")
      instance.defaults.paramsSerializer = { serialize: () => "page=1" };
    const client = createClient(kind, { axiosInstance: instance, retryCount: 2, retryDelay: 0 });
    const result = resultOf(client.get("/items"));
    await expect(result).rejects.toHaveProperty("error.cause", failure);
    expect(context.calls).toBe(1);
  });

  it("重试等待期间新增默认参数时，返回前一次失败", async () => {
    vi.useFakeTimers();
    try {
      const failure = new AxiosError("network offline", AxiosError.ERR_NETWORK);
      const { context, instance } = createAxiosInstance(() => {
        throw failure;
      });
      const client = createClient(kind, { axiosInstance: instance, retryCount: 2, retryDelay: 50 });
      const rejected = expect(resultOf(client.get("/items"))).rejects.toHaveProperty(
        "error.cause",
        failure,
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
      instance.defaults.params = { tenant: "new" };
      await vi.advanceTimersByTimeAsync(50);
      await rejected;
      expect(context.calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    undefined,
    "same",
  ])("并发键 %s 区分有效 responseType，忽略已覆盖的默认 timeout", async (dedupeKey) => {
    const release = deferred();
    const { context, instance, started } = createAxiosInstance(async (config) => {
      await release.promise;
      return response(config, '{"page":1}');
    });
    instance.defaults.responseType = "text";
    const secondResolved = deferred();
    let resolved = 0;
    const client = createClient(kind, {
      axiosInstance: instance,
      transformHeaders: (headers) => {
        if (++resolved === 2) secondResolved.resolve();
        return headers;
      },
    });
    const options = { ...(dedupeKey === undefined ? {} : { dedupeKey }), timeout: 15 };
    const first = resultOf(client.get("/format", options));
    await started;
    instance.defaults.timeout = 99;
    const shared = resultOf(client.get("/format", options));
    await secondResolved.promise;
    instance.defaults.responseType = "json";
    const different = resultOf(client.get("/format", options));
    release.resolve();
    await expect(Promise.all([first, shared, different])).resolves.toMatchObject([
      { data: '{"page":1}' },
      { data: '{"page":1}' },
      { data: { page: 1 } },
    ]);
    expect(context.configs.map(({ responseType, timeout }) => [responseType, timeout])).toEqual([
      ["text", 15],
      ["json", 15],
    ]);
  });

  it("普通 toJSON 数据字段与跨 Realm 数组可自动去重，真正的序列化钩子各自执行", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config, config.data));
    const client = createClient(kind, { axiosInstance: instance });
    const local = { list: [1, 2], toJSON: "plain" };
    const foreign = { list: runInNewContext("[1, 2]"), toJSON: "plain" };
    await Promise.all([local, foreign].map((body) => resultOf(client.post("/json", body))));
    expect(context.calls).toBe(1);
    let calls = 0;
    const custom = { toJSON: () => ({ id: ++calls }) };
    await expect(
      Promise.all([custom, custom].map((body) => resultOf(client.post("/json", body)))),
    ).resolves.toMatchObject([{ data: { id: 1 } }, { data: { id: 2 } }]);
    expect(calls).toBe(2);
    expect(context.calls).toBe(3);
  });

  it("默认 params 的继承与显式 undefined 屏蔽会发往不同 URI", async () => {
    const { instance } = createAxiosInstance((config) => response(config, instance.getUri(config)));
    instance.defaults.params = { page: 1 };
    const client = createClient(kind, { axiosInstance: instance });
    await expect(
      Promise.all([
        resultOf(client.get("/items", { params: {} })),
        resultOf(client.get("/items", { params: { page: undefined } })),
      ]),
    ).resolves.toMatchObject([{ data: "/items?page=1" }, { data: "/items" }]);
  });

  it("自动去重不预读 params 与 data 中的 getter", async () => {
    let reads = 0;
    const changing = {
      get id() {
        return ++reads;
      },
    };
    const { instance } = createAxiosInstance((config) =>
      response(config, [config.params.id, config.data]),
    );
    const client = createClient(kind, { axiosInstance: instance });
    const send = () => resultOf(client.post("/values", changing, { params: changing }));
    const results = await Promise.all([send(), send()]);
    expect(reads).toBe(4);
    // Axios 在一次调度中分别读取查询与请求体；下一次发送不能复用第一次读到的值。
    expect(results[0]).not.toEqual(results[1]);
    expect(results).toMatchObject([
      { data: [expect.any(Number), expect.any(String)] },
      { data: [expect.any(Number), expect.any(String)] },
    ]);
  });

  it("顶层字段与请求头分组的 getter 各读取一次，沿用首次屏蔽值", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    instance.defaults.headers.common["X-Default"] = "default";
    const client = createClient(kind, { axiosInstance: instance });
    const url = vi.fn(() => "/snapshot");
    const method = vi.fn(() => "GET" as const);
    const common = vi.fn().mockReturnValueOnce(null).mockReturnValue(new AxiosHeaders());
    await resultOf(
      client.request({
        headers: Object.defineProperty({}, "common", { enumerable: true, get: common }),
        get method() {
          return method();
        },
        get url() {
          return url();
        },
      }),
    );
    expect(url).toHaveBeenCalledOnce();
    expect(method).toHaveBeenCalledOnce();
    expect(common).toHaveBeenCalledOnce();
    expect(context.configs[0]?.headers.get("X-Default")).toBeUndefined();
  });

  it("仅请求头名称大小写不同的并发调用共享传输", async () => {
    const { context, instance } = createAxiosInstance((config) =>
      response(config, config.headers.get("x-token")),
    );
    const client = createClient(kind, { axiosInstance: instance });
    await expect(
      Promise.all([
        resultOf(client.get("/case", { headers: { "X-Token": "same" } })),
        resultOf(client.get("/case", { headers: { "x-token": "same" } })),
      ]),
    ).resolves.toMatchObject([{ data: "same" }, { data: "same" }]);
    expect(context.calls).toBe(1);
  });

  it("PUT 已消费的 Readable 遇到 503 时保留首次错误", async () => {
    let failure: AxiosError | undefined;
    const bodies: string[] = [];
    const { instance } = createAxiosInstance(async (config) => {
      if (!(config.data instanceof Readable)) throw new Error("请求体应为 Node 流");
      bodies.push(await text(config.data));
      if (bodies.length > 1) return response(config);
      failure = new AxiosError(
        "unavailable",
        AxiosError.ERR_BAD_RESPONSE,
        config,
        undefined,
        response(config, null, 503),
      );
      throw failure;
    });
    const client = createClient(kind, { axiosInstance: instance, retryNonIdempotent: true });
    const request = resultOf(client.put("/upload", Readable.from(["payload"])));
    await expect(request).rejects.toMatchObject({ code: 503, error: { kind: "http" } });
    await expect(request).rejects.toHaveProperty("error.cause", failure);
    expect(bodies).toEqual(["payload"]);
  });

  it("含 timeout 的 Axios 配置错误保留错误分类且只发送一次", async () => {
    const failure = new AxiosError("invalid timeout", AxiosError.ERR_BAD_OPTION_VALUE);
    const { context, instance } = createAxiosInstance(() => {
      throw failure;
    });
    const client = createClient(kind, { axiosInstance: instance });
    await expect(resultOf(client.get("/timeout"))).rejects.toMatchObject({
      error: { cause: failure, kind: "config" },
    });
    expect(context.calls).toBe(1);
  });

  it("动态 token 参与去重身份，不同 token 的并发请求各自执行", async () => {
    const release = deferred();
    const bothStarted = deferred();
    const { context, instance, started } = createAxiosInstance(async (config, current) => {
      if (current.calls === 2) bothStarted.resolve();
      await release.promise;
      return response(config);
    });
    let token = "first";
    const client = createClient(kind, {
      axiosInstance: instance,
      dedupe: true,
      transformHeaders: () => ({ Authorization: token }),
    });

    const first = resultOf(client.get("/identity"));
    await started;
    token = "second";
    const second = resultOf(client.get("/identity"));
    await bothStarted.promise;
    release.resolve();
    await Promise.all([first, second]);
    expect(context.calls).toBe(2);
    expect(context.configs.map((config) => config.headers.get("Authorization"))).toEqual([
      "first",
      "second",
    ]);
  });

  it("相同转换后 headers 仍共享请求，响应转换则分别为两个调用方执行", async () => {
    const release = deferred();
    const { context, instance, started } = createAxiosInstance(async (config) => {
      await release.promise;
      return response(config, { id: 7 });
    });
    const transformHeaders = vi.fn(() => ({ Authorization: "same-token" }));
    let responseCalls = 0;
    const transformResponse = vi.fn(() => ++responseCalls);
    const client = createClient(kind, {
      axiosInstance: instance,
      dedupe: true,
      transformHeaders,
      transformResponse,
    });

    const first = resultOf(client.get("/shared"));
    const second = resultOf(client.get("/shared"));
    await started;
    release.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(context.calls).toBe(1);
    expect(transformHeaders).toHaveBeenCalledTimes(2);
    expect(transformResponse).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, null, false, 42, "plain text"])("响应转换支持返回 %s", async (value) => {
    const { instance } = createAxiosInstance((config) => response(config));
    const client = createClient(kind, {
      axiosInstance: instance,
      transformResponse: () => value,
    });

    await expect(resultOf(client.get("/primitive"))).resolves.toBe(value);
  });

  it.each([
    false,
    true,
  ])("响应转换的 Promise 会展开为最终返回值（create=%s）", async (useFactory) => {
    const { instance } = createAxiosInstance((config) => response(config, { id: 7 }));
    const client = createClient(
      kind,
      {
        axiosInstance: instance,
        transformResponse: async (value) => ({ payload: value.data }),
      },
      useFactory,
    );

    await expect(resultOf(client.get("/async"))).resolves.toEqual({ payload: { id: 7 } });
  });

  it("HTTP 失败沿原错误通道传播，不调用响应转换", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config, {}, 400));
    const transformResponse = vi.fn(() => "unexpected");
    const client = createClient(kind, { axiosInstance: instance, transformResponse });
    const result = resultOf(client.get("/failed"));

    await expect(result).rejects.toBeInstanceOf(ErrorClass);
    await expect(result).rejects.toMatchObject({ code: 400, error: { kind: "http" } });
    expect(transformResponse).not.toHaveBeenCalled();
    expect(context.calls).toBe(1);
  });

  it("请求头回调报错归类为 config，保留原因且不执行网络", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const cause = new Error("token lookup failed");
    const client = createClient(kind, {
      axiosInstance: instance,
      transformHeaders: () => {
        throw cause;
      },
    });
    const result = resultOf(client.get("/headers-error"));

    await expect(result).rejects.toBeInstanceOf(ErrorClass);
    await expect(result).rejects.toMatchObject({ error: { cause, kind: "config" } });
    expect(context.calls).toBe(0);
  });

  it.each([
    false,
    true,
  ])("响应转换同步或异步失败不会触发网络重试（async=%s）", async (asyncFailure) => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const cause = new AxiosError("转换失败模拟可重试错误", AxiosError.ERR_NETWORK);
    const transformResponse = vi.fn(() => {
      if (asyncFailure) return Promise.reject(cause);
      throw cause;
    });
    const client = createClient(kind, {
      axiosInstance: instance,
      retryCount: 3,
      retryDelay: 0,
      transformResponse,
    });
    const result = resultOf(client.get("/response-error"));

    await expect(result).rejects.toBeInstanceOf(ErrorClass);
    await expect(result).rejects.toMatchObject({ error: { cause, kind: "network" } });
    expect(context.calls).toBe(1);
    expect(transformResponse).toHaveBeenCalledOnce();
  });

  it("取消信号可以结束等待异步响应转换", async () => {
    const transformStarted = deferred();
    const transformed = deferred<string>();
    const { context, instance } = createAxiosInstance((config) => response(config));
    const controller = new AbortController();
    const client = createClient(kind, {
      axiosInstance: instance,
      transformResponse: () => {
        transformStarted.resolve();
        return transformed.promise;
      },
    });
    const result = resultOf(client.get("/cancel-transform", { signal: controller.signal }));
    const rejected = expect(result).rejects.toMatchObject({ error: { kind: "cancel" } });

    await transformStarted.promise;
    controller.abort();
    await rejected;
    await expect(result).rejects.toBeInstanceOf(ErrorClass);
    transformed.resolve("too late");
    expect(context.calls).toBe(1);
  });

  it.each([
    "transformHeaders",
    "transformResponse",
  ] as const)("构造与 create 拒绝非法 %s", (field) => {
    for (const invalid of [null, 42, {}]) {
      // 故意绕过类型边界，验证 JavaScript 调用方的运行时输入。
      const options = { [field]: invalid } as never;
      expect(() => createClient(kind, options)).toThrow(`${field} 必须是函数`);
      expect(() => createClient(kind, options, true)).toThrow(`${field} 必须是函数`);
    }
  });

  it.each([
    null,
    [],
    Promise.resolve({}),
    new Date(0),
    42,
  ])("请求头回调拒绝非同步 headers 对象：%s", async (value) => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = createClient(kind, {
      axiosInstance: instance,
      // 故意构造不符合公开签名的返回值，验证实际边界校验。
      transformHeaders: () => value as never,
    });

    await expect(resultOf(client.get("/invalid-headers"))).rejects.toMatchObject({
      error: { kind: "config", message: "transformHeaders 必须同步返回 headers 对象" },
    });
    expect(context.calls).toBe(0);
  });
});

it("RxJS 在每次订阅时重新执行请求头转换，创建 Observable 时不读取 token", async () => {
  const { context, instance } = createAxiosInstance((config) => response(config));
  let token = "initial";
  const transformHeaders = vi.fn(() => ({ Authorization: token }));
  const client = new RxHttpClient({ axiosInstance: instance, transformHeaders });
  const request = client.get("/subscription-token");

  expect(transformHeaders).not.toHaveBeenCalled();
  token = "first-subscription";
  await firstValueFrom(request);
  token = "second-subscription";
  await firstValueFrom(request);

  expect(transformHeaders).toHaveBeenCalledTimes(2);
  expect(context.configs.map((config) => config.headers.get("Authorization"))).toEqual([
    "first-subscription",
    "second-subscription",
  ]);
});
