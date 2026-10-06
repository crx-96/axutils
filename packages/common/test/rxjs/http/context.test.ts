import { AxiosError, AxiosHeaders, type RawAxiosRequestHeaders } from "axios";
import { Subject, finalize, firstValueFrom, from, of, throwError } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type HttpClientConfig,
  type HttpRequestContext,
  RxHttpClient,
} from "../../../src/rxjs/http.js";
import {
  createAxiosInstance,
  createPendingAxiosInstance,
  response,
} from "../../helpers/http/adapter.js";
import { deferred } from "../../helpers/http/deferred.js";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("rxjs/http 每次订阅的业务上下文", () => {
  it("创建冷流不捕获状态，订阅在配置等待前捕获引用，重订阅和并发分别捕获", async () => {
    let session: Readonly<{ identity: number; language: string; token: string }> = Object.freeze({
      identity: 1,
      language: "zh-CN",
      token: "old",
    });
    const original = session;
    const configGate = deferred<Partial<HttpClientConfig>>();
    const factory = vi.fn(() => from(configGate.promise));
    const createContext = vi.fn(() => session);
    const seen: HttpRequestContext<typeof session>[] = [];
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = RxHttpClient.create(factory, {
      axiosInstance: instance,
      createContext,
      transformHeaders: (headers, request) => {
        expect(request.headers).toBeUndefined();
        return {
          ...headers,
          "Accept-Language": request.context?.language,
          Authorization: request.context?.token ?? null,
        };
      },
      transformResponse: (_result, request) => {
        seen.push(request);
        return request.context;
      },
    });
    const stream = client.get("/identity");
    expect(createContext).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    const first = firstValueFrom(stream);
    expect(createContext).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledOnce();
    session = Object.freeze({ identity: 2, language: "en", token: "new" });
    const second = firstValueFrom(stream);
    configGate.resolve({ baseUrl: "/api" });
    expect(await first).toBe(original);
    expect(await second).toBe(session);
    expect(await firstValueFrom(stream)).toBe(session);
    expect(createContext).toHaveBeenCalledTimes(3);
    expect(factory).toHaveBeenCalledOnce();
    expect(context.calls).toBe(3);
    expect(context.configs.map((config) => config.headers.get("Authorization"))).toEqual([
      "old",
      "new",
      "new",
    ]);
    expect(seen.map((request) => request.headers?.["Accept-Language"])).toEqual([
      "zh-CN",
      "en",
      "en",
    ]);
    expect(seen[0]?.context).toBe(original);
    expect(original).toEqual({ identity: 1, language: "zh-CN", token: "old" });
  });

  it.each([200, 503])("网络去重仍给每个订阅独立的上下文（HTTP %s）", async (status) => {
    const gate = deferred();
    let identity = 0;
    const contexts: object[] = [];
    const { context, instance } = createAxiosInstance(async (config) => {
      expect(config).not.toHaveProperty("context");
      expect(config).not.toHaveProperty("createContext");
      await gate.promise;
      return response(config, {}, status);
    });
    const client = new RxHttpClient({
      axiosInstance: instance,
      createContext: () => {
        const value = {
          identity: ++identity,
          nonSerializable: () => undefined,
          self: new Set<object>(),
        };
        value.self.add(value);
        contexts.push(value);
        return value;
      },
      retryCount: 1,
      transformError: (_error, request) => request.context,
      transformHeaders: () => ({ Authorization: "shared" }),
      transformResponse: (_result, request) => Promise.resolve(request.context),
    });
    const stream = client.get("/shared");
    const first = firstValueFrom(stream);
    const second = firstValueFrom(stream);
    gate.resolve();
    expect(await first).toBe(contexts[0]);
    expect(await second).toBe(contexts[1]);
    expect(context.calls).toBe(1);
    await firstValueFrom(stream);
    expect(context.calls).toBe(2);
  });

  it.each([200, 503])("内部重试复用上下文和最终 Header（HTTP %s）", async (status) => {
    vi.useFakeTimers();
    let session = { language: "zh-CN", token: "old" };
    const original = session;
    const transport = createAxiosInstance((config, context) => {
      if (context.calls < 3) return response(config, {}, 503);
      return response(config, {}, status);
    });
    transport.instance.defaults.headers.common["X-Default"] = "original";
    const createContext = vi.fn(() => session);
    const transformHeaders = vi.fn(
      (_headers: RawAxiosRequestHeaders, request: HttpRequestContext<typeof session>) => ({
        "Accept-Language": request.context?.language,
        Authorization: request.context?.token ?? null,
      }),
    );
    const client = new RxHttpClient({
      axiosInstance: transport.instance,
      createContext,
      retryDelay: 10,
      transformError: (_error, request) => request,
      transformHeaders,
      transformResponse: (_result, request) => request,
    });
    const result = firstValueFrom(client.get("/retry"));
    await transport.started;
    session = { language: "en", token: "new" };
    transport.instance.defaults.headers.common["X-Default"] = "changed";
    transport.instance.defaults.headers.common["X-New-Common"] = "new";
    transport.instance.defaults.headers.get["X-New-Method"] = "new";
    transport.instance.defaults.headers["X-New-Direct"] = "new";
    await vi.runAllTimersAsync();
    const completed = await result;
    expect(completed.context).toBe(original);
    expect(completed.headers).toMatchObject({
      "Accept-Language": "zh-CN",
      Authorization: "old",
      "X-Default": "original",
    });
    expect(createContext).toHaveBeenCalledOnce();
    expect(transformHeaders).toHaveBeenCalledOnce();
    expect(transport.context.calls).toBe(3);
    for (const config of transport.context.configs) {
      expect(config.headers.get("X-New-Common")).toBeUndefined();
      expect(config.headers.get("X-New-Method")).toBeUndefined();
      expect(config.headers.get("X-New-Direct")).toBeUndefined();
    }
    expect(transport.context.configs.map((config) => config.headers.get("Authorization"))).toEqual([
      "old",
      "old",
      "old",
    ]);
  });

  it.each([
    "explicit",
    "",
    null,
    false,
    undefined,
  ])("最终请求头保留分层覆盖与显式值 %s，不修改调用方数据", async (authorization) => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    instance.defaults.headers.common.Authorization = "instance-common";
    instance.defaults.headers.get.Authorization = "instance-method";
    instance.defaults.headers.common["Accept-Language"] = "default-language";
    const headers = {
      authorization,
      common: new AxiosHeaders({ Authorization: "request-common", "X-Group": "common" }),
      get: new AxiosHeaders({ Authorization: "request-method", "X-Group": "method" }),
      "X-Multi": ["original"],
    };
    const client = new RxHttpClient({
      axiosInstance: instance,
      createContext: () => ({ token: "callback" }),
      transformHeaders: (copy, request) => {
        const values = copy["X-Multi"];
        if (Array.isArray(values)) values.push("modified");
        return { ...copy, Authorization: request.context?.token ?? null, "X-Added": "added" };
      },
      transformResponse: (_result, request) => request.headers,
    });
    const actual = await firstValueFrom(client.get("/headers", { headers }));
    expect(actual?.Authorization).toBe(authorization);
    expect(actual).toMatchObject({
      "Accept-Language": "default-language",
      "X-Added": "added",
      "X-Group": "method",
      "X-Multi": ["original"],
    });
    expect(actual).not.toHaveProperty("Common");
    expect(actual).not.toHaveProperty("Get");
    expect(actual).not.toHaveProperty("Query");
    expect(Object.isFrozen(actual)).toBe(true);
    expect(Object.isFrozen(actual?.["X-Multi"])).toBe(true);
    expect(context.configs[0]?.headers.get("Authorization")).toBe(authorization);
    expect(headers.authorization).toBe(authorization);
    expect(headers.common.get("Authorization")).toBe("request-common");
    expect(headers.get.get("Authorization")).toBe("request-method");
    expect(headers["X-Multi"]).toEqual(["original"]);
  });

  it.each([
    "common",
    "get",
  ] as const)("请求级 %s 凭据覆盖默认 false，不会在 Axios 再合并时丢失", async (group) => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    instance.defaults.headers[group].Authorization = false;
    const client = new RxHttpClient({
      axiosInstance: instance,
      transformResponse: (_result, request) => request.headers,
    });
    const headers = await firstValueFrom(
      client.get("/explicit-credential", {
        headers: { [group]: new AxiosHeaders({ Authorization: "explicit-token" }) },
      }),
    );
    expect(headers?.Authorization).toBe("explicit-token");
    expect(context.configs[0]?.headers.get("Authorization")).toBe("explicit-token");
    expect(instance.defaults.headers[group].Authorization).toBe(false);
  });

  it("没有 Header 回调也捕获实例默认值，变化后的默认值参与去重", async () => {
    const gate = deferred();
    const { context, instance } = createAxiosInstance(async (config) => {
      await gate.promise;
      return response(config);
    });
    instance.defaults.headers.common.Authorization = "first";
    instance.defaults.headers.get.Authorization = "method-first";
    const client = new RxHttpClient({
      axiosInstance: instance,
      transformResponse: (_result, request) => request.headers?.Authorization,
    });
    const first = firstValueFrom(client.get("/defaults"));
    instance.defaults.headers.get.Authorization = "method-second";
    const second = firstValueFrom(client.get("/defaults"));
    gate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(["method-first", "method-second"]);
    expect(context.calls).toBe(2);
  });

  it.each([200, 401])("结果阶段提供 Axios 实际调度的 Header（HTTP %s）", async (status) => {
    const { instance } = createAxiosInstance((config) => response(config, {}, status));
    instance.interceptors.request.use((config) => {
      config.headers.set("Authorization", "interceptor-token");
      return config;
    });
    const client = new RxHttpClient({
      axiosInstance: instance,
      transformError: (_error, request) => request.headers,
      transformHeaders: () => ({ Authorization: "callback-token" }),
      transformResponse: (_result, request) => request.headers,
    });
    const headers = await firstValueFrom(client.post("/actual", { value: 1 }));
    expect(headers).toMatchObject({
      Authorization: "interceptor-token",
      "Content-Type": "application/json",
    });
  });
});

describe("rxjs/http 上下文初始化、失败和取消", () => {
  it("上下文创建失败进入一次 config 错误转换且可再次订阅恢复", async () => {
    const cause = new Error("context unavailable");
    const factory = vi.fn(() => of({}));
    const createContext = vi
      .fn<() => { identity: number }>()
      .mockImplementationOnce(() => {
        throw cause;
      })
      .mockReturnValue({ identity: 2 });
    const { context, instance } = createAxiosInstance((config) => response(config));
    const transformError = vi.fn(
      (_error, request: HttpRequestContext<{ identity: number }>) => request,
    );
    const client = RxHttpClient.create(factory, {
      axiosInstance: instance,
      createContext,
      transformError,
      transformResponse: (_result, request) => request,
    });
    const stream = client.get("/initialization");
    await expect(firstValueFrom(stream)).resolves.toEqual({
      context: undefined,
      headers: undefined,
    });
    expect(transformError.mock.calls[0]?.[0]).toMatchObject({ error: { cause, kind: "config" } });
    expect(transformError).toHaveBeenCalledOnce();
    expect(factory).not.toHaveBeenCalled();
    expect(context.calls).toBe(0);
    await expect(firstValueFrom(stream)).resolves.toMatchObject({ context: { identity: 2 } });
    expect(createContext).toHaveBeenCalledTimes(2);
    expect(context.calls).toBe(1);
  });

  it("上下文创建异常在无错误回调时由 error 通道发出；非法工厂在构造时拒绝", async () => {
    const cause = new Error("capture failed");
    const stream = new RxHttpClient({
      createContext: () => {
        throw cause;
      },
    }).get("/failure");
    await expect(firstValueFrom(stream)).rejects.toMatchObject({
      error: { cause, kind: "config" },
    });
    expect(() => new RxHttpClient({ createContext: null as never })).toThrow(
      "createContext 必须是函数",
    );
  });

  it("配置重试沿用同一上下文；配置或请求校验失败时 headers 尚未生成", async () => {
    const original = { identity: 1 };
    const createContext = vi.fn(() => original);
    const factory = vi.fn(() => throwError(() => new Error("config failed")));
    const client = RxHttpClient.create(factory, {
      createContext,
      transformError: (error, request) => ({ error, request }),
    });
    const failed = await firstValueFrom(client.get("/configuration"));
    expect(failed).toMatchObject({
      error: { error: { kind: "config" } },
      request: { context: original, headers: undefined },
    });
    expect(factory).toHaveBeenCalledTimes(3);
    expect(createContext).toHaveBeenCalledOnce();
    const invalid = await firstValueFrom(client.get("/invalid", { retryCount: 0 }));
    expect(invalid).toMatchObject({ request: { context: original, headers: undefined } });
    expect(factory).toHaveBeenCalledTimes(3);
    expect(createContext).toHaveBeenCalledTimes(2);
    const synchronous = new RxHttpClient({ createContext });
    expect(() => synchronous.get("/invalid", { retryCount: 0 })).toThrow(TypeError);
    expect(createContext).toHaveBeenCalledTimes(2);
  });

  it("Header 转换失败保留上下文且不重试、不生成最终头", async () => {
    const original = { identity: 1 };
    const cause = new Error("headers failed");
    const { context, instance } = createAxiosInstance((config) => response(config));
    const transformHeaders = vi.fn(() => {
      throw cause;
    });
    const transformError = vi.fn((_error, request: HttpRequestContext<typeof original>) => request);
    const client = new RxHttpClient({
      axiosInstance: instance,
      createContext: () => original,
      transformError,
      transformHeaders,
    });
    await expect(firstValueFrom(client.get("/headers"))).resolves.toEqual({
      context: original,
      headers: undefined,
    });
    expect(transformHeaders).toHaveBeenCalledOnce();
    expect(transformError).toHaveBeenCalledOnce();
    expect(context.calls).toBe(0);
  });

  it.each([
    "throw",
    "promise",
    "observable",
  ])("成功转换与错误转换的 %s 失败不重试或递归，保留订阅信息", async (mode) => {
    const original = { identity: 1 };
    const cause = new AxiosError("transform failed", AxiosError.ERR_NETWORK);
    const fail = () => {
      if (mode === "promise") return Promise.reject(cause);
      if (mode === "observable") return throwError(() => cause);
      throw cause;
    };
    const { context, instance } = createAxiosInstance((config) => response(config));
    const transformError = vi.fn((_error, request: HttpRequestContext<typeof original>) => {
      expect(request.context).toBe(original);
      expect(request.headers?.Authorization).toBe("token");
      return fail();
    });
    const client = new RxHttpClient({
      axiosInstance: instance,
      createContext: () => original,
      transformError,
      transformHeaders: () => ({ Authorization: "token" }),
      transformResponse: fail,
    });
    await expect(firstValueFrom(client.get("/transform"))).rejects.toMatchObject({
      error: { cause, kind: "unknown" },
    });
    expect(transformError).toHaveBeenCalledOnce();
    expect(context.calls).toBe(1);
  });

  it.each([true, false])("配置等待时取消保留已捕获上下文（预先取消=%s）", async (preAborted) => {
    const source = new Subject<Partial<HttpClientConfig>>();
    const finalized = vi.fn();
    const factory = vi.fn(() => source.pipe(finalize(finalized)));
    const original = { identity: 1 };
    const createContext = vi.fn(() => original);
    const controller = new AbortController();
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = RxHttpClient.create(factory, {
      axiosInstance: instance,
      createContext,
      transformError: (error, request) => ({ error, request }),
    });
    if (preAborted) controller.abort();
    const result = firstValueFrom(client.get("/cancel", { signal: controller.signal }));
    if (!preAborted) controller.abort();
    await expect(result).resolves.toMatchObject({
      error: { error: { kind: "cancel" } },
      request: { context: original, headers: undefined },
    });
    expect(createContext).toHaveBeenCalledOnce();
    expect(context.calls).toBe(0);
    expect(factory).toHaveBeenCalledTimes(preAborted ? 0 : 1);
    expect(finalized).toHaveBeenCalledTimes(preAborted ? 0 : 1);
  });

  it("共享配置期间取消一个订阅不影响另一个上下文", async () => {
    const gate = new Subject<Partial<HttpClientConfig>>();
    let identity = 0;
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = RxHttpClient.create(() => gate, {
      axiosInstance: instance,
      createContext: () => ++identity,
      transformError: (_error, request) => request.context,
      transformResponse: (_result, request) => request.context,
    });
    const controller = new AbortController();
    const first = firstValueFrom(client.get("/first", { signal: controller.signal }));
    const second = firstValueFrom(client.get("/second"));
    controller.abort();
    await expect(first).resolves.toBe(1);
    gate.next({});
    await expect(second).resolves.toBe(2);
    expect(context.calls).toBe(1);
  });

  it("发送后显式取消提供已确定 Header，并清理底层请求", async () => {
    const pending = createPendingAxiosInstance();
    const controller = new AbortController();
    const original = { identity: 1 };
    const client = new RxHttpClient({
      axiosInstance: pending.instance,
      createContext: () => original,
      transformError: (_error, request) => request,
      transformHeaders: () => ({ Authorization: "token" }),
    });
    const result = firstValueFrom(client.get("/cancel", { signal: controller.signal }));
    await pending.started;
    controller.abort();
    await expect(result).resolves.toMatchObject({
      context: original,
      headers: { Authorization: "token" },
    });
    expect(pending.abortCount).toBe(1);
  });

  it.each([
    false,
    true,
  ])("主动退订不触发业务转换，保留底层自动取消策略 %s", async (cancelOnNoSubscribers) => {
    const pending = createPendingAxiosInstance();
    const transformError = vi.fn(() => "error");
    const transformResponse = vi.fn(() => "success");
    const client = new RxHttpClient({
      axiosInstance: pending.instance,
      cancelOnNoSubscribers,
      createContext: () => ({ identity: 1 }),
      transformError,
      transformResponse,
    });
    const first = client.get("/shared").subscribe();
    const second = client.get("/shared").subscribe();
    await pending.started;
    first.unsubscribe();
    expect(pending.abortCount).toBe(0);
    second.unsubscribe();
    expect(pending.abortCount).toBe(cancelOnNoSubscribers ? 1 : 0);
    pending.complete();
    expect(transformError).not.toHaveBeenCalled();
    expect(transformResponse).not.toHaveBeenCalled();
  });
});
