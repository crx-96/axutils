import { AxiosError, type RawAxiosRequestHeaders } from "axios";
import {
  EMPTY,
  Observable,
  Subject,
  finalize,
  firstValueFrom,
  forkJoin,
  from,
  lastValueFrom,
  of,
  throwError,
  toArray,
} from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type HttpClientConfig,
  HttpRequestError,
  type HttpSuccess,
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

describe("rxjs/http 统一错误转换", () => {
  it.each([
    { attempts: 1, kind: "http", status: 400 },
    { attempts: 3, kind: "http", status: 503 },
    { attempts: 3, kind: "network", status: 0 },
    { attempts: 3, kind: "timeout", status: 0 },
  ])("$kind/$status 最终失败后只转换一次，并保留状态和 cause", async (item) => {
    vi.useFakeTimers();
    const body = { code: 123, data: null, message: "failed", request_id: "request-42" };
    const { context, instance } = createAxiosInstance((config) => {
      if (item.status > 0) return response(config, body, item.status);
      throw new AxiosError(
        item.kind,
        item.kind === "timeout" ? AxiosError.ETIMEDOUT : AxiosError.ERR_NETWORK,
        config,
      );
    });
    const transformError = vi.fn((error: HttpRequestError) => ({
      cause: error.error.cause,
      kind: error.error.kind,
      status: error.code,
    }));
    const transformResponse = vi.fn(() => "success");
    const client = new RxHttpClient({
      axiosInstance: instance,
      retryDelay: 10,
      transformError,
      transformResponse,
    });
    const result = firstValueFrom(client.get("/failure"));
    await vi.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({ kind: item.kind, status: item.status });
    expect(context.calls).toBe(item.attempts);
    expect(transformError).toHaveBeenCalledOnce();
    expect(transformResponse).not.toHaveBeenCalled();
    const error = transformError.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error?.error.cause).toBeInstanceOf(AxiosError);
    if (item.status > 0) {
      expect(error?.error.cause).toMatchObject({ response: { data: body, status: item.status } });
    }
  });

  it.each([
    false,
    true,
  ])("错误转换保留非幂等请求的重试限制（显式开启=%s）", async (retryNonIdempotent) => {
    const { context, instance } = createAxiosInstance(() => {
      throw new Error("network down");
    });
    const transformError = vi.fn(() => "recovered");
    const client = new RxHttpClient({ axiosInstance: instance, transformError });

    await expect(
      firstValueFrom(client.post("/write", { value: 1 }, { retryNonIdempotent })),
    ).resolves.toBe("recovered");
    expect(context.calls).toBe(retryNonIdempotent ? 3 : 1);
    expect(transformError).toHaveBeenCalledOnce();
  });

  it.each([
    200, 201, 204,
  ])("使用方可原样返回 HTTP 200 的业务失败并自行处理 HTTP %s", async (status) => {
    const body = {
      code: 1001,
      data: null,
      message: "业务校验失败",
      request_id: "business-42",
      signature: "signature",
      timestamp: 123,
    };
    const { context, instance } = createAxiosInstance((config) => response(config, body, status));
    const transformError = vi.fn(() => ({ ...body, message: "请求异常" }));
    const client = new RxHttpClient({
      axiosInstance: instance,
      transformError,
      transformResponse: (result: HttpSuccess<typeof body>) =>
        result.code === 200 ? result.data : { ...body, code: result.code, message: "非 200 响应" },
    });

    await expect(firstValueFrom(client.get("/business"))).resolves.toEqual(
      status === 200 ? body : { ...body, code: status, message: "非 200 响应" },
    );
    expect(context.calls).toBe(1);
    expect(transformError).not.toHaveBeenCalled();
  });

  it("配置初始化保持懒执行、并发共享和失败重试，成功后缓存配置", async () => {
    const gate = deferred<Partial<HttpClientConfig>>();
    const cause = new Error("configuration unavailable");
    let factoryCalls = 0;
    const factory = vi.fn(() => {
      factoryCalls += 1;
      return factoryCalls <= 3 ? from(gate.promise) : of({});
    });
    const { context, instance } = createAxiosInstance((config) => response(config));
    const transformError = vi.fn((error: HttpRequestError) => error.error.kind);
    const client = RxHttpClient.create(factory, { axiosInstance: instance, transformError });
    const first$ = client.get("/first");
    const second$ = client.get("/second");
    expect(factory).not.toHaveBeenCalled();
    const failed = firstValueFrom(forkJoin([first$, second$]));
    expect(factory).toHaveBeenCalledOnce();
    gate.reject(cause);

    await expect(failed).resolves.toEqual(["config", "config"]);
    expect(factory).toHaveBeenCalledTimes(3);
    expect(transformError).toHaveBeenCalledTimes(2);
    expect(transformError.mock.calls[0]?.[0].error.cause).toBe(cause);
    expect(context.calls).toBe(0);

    await firstValueFrom(client.get("/after-recovery"));
    await firstValueFrom(client.get("/cached-config"));
    expect(factory).toHaveBeenCalledTimes(4);
    expect(context.calls).toBe(2);
  });

  it("请求头转换异常属于配置错误，保留 cause 且不发送请求", async () => {
    const cause = new Error("token cache unavailable");
    const { context, instance } = createAxiosInstance((config) => response(config));
    const transformHeaders = vi.fn(() => {
      throw cause;
    });
    const transformError = vi.fn((error: HttpRequestError) => error.error.kind);
    const request$ = new RxHttpClient({
      axiosInstance: instance,
      transformError,
      transformHeaders,
    }).get("/headers");
    expect(transformHeaders).not.toHaveBeenCalled();

    await expect(firstValueFrom(request$)).resolves.toBe("config");
    expect(transformError.mock.calls[0]?.[0].error.cause).toBe(cause);
    expect(transformHeaders).toHaveBeenCalledOnce();
    expect(context.calls).toBe(0);
  });

  it.each([
    "throw",
    "promise",
    "observable",
  ])("响应转换的 %s 异常只进入一次错误转换，不重发请求", async (mode) => {
    const cause = new AxiosError("response transform failed", AxiosError.ERR_NETWORK);
    const { context, instance } = createAxiosInstance((config) => response(config));
    const transformError = vi.fn((_error: HttpRequestError) => "fallback");
    const client = new RxHttpClient({
      axiosInstance: instance,
      transformError,
      transformResponse: () => {
        if (mode === "promise") return Promise.reject(cause);
        if (mode === "observable") return throwError(() => cause);
        throw cause;
      },
    });

    await expect(firstValueFrom(client.get("/response-error"))).resolves.toBe("fallback");
    expect(transformError.mock.calls[0]?.[0].error.cause).toBe(cause);
    expect(transformError).toHaveBeenCalledOnce();
    expect(context.calls).toBe(1);
  });

  it.each([
    "throw",
    "promise",
    "observable",
  ])("错误转换自身的 %s 异常保留原因，不递归转换或重试", async (mode) => {
    const cause = new AxiosError("recovery failed", AxiosError.ERR_NETWORK);
    const { context, instance } = createAxiosInstance(() => {
      throw new Error("transport failed");
    });
    const transformError = vi.fn(() => {
      if (mode === "promise") return Promise.reject(cause);
      if (mode === "observable") return throwError(() => cause);
      throw cause;
    });
    const request$ = new RxHttpClient({ axiosInstance: instance, transformError }).get(
      "/recovery-error",
    );

    await expect(firstValueFrom(request$)).rejects.toMatchObject({
      error: { cause, kind: "unknown" },
    });
    expect(transformError).toHaveBeenCalledOnce();
    expect(context.calls).toBe(3);
  });

  it("响应流发值后失败时追加恢复结果，保留已发出的值且不重放请求", async () => {
    const cause = new Error("response stream failed");
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = new RxHttpClient({
      axiosInstance: instance,
      transformError: () => of("fallback", "finished"),
      transformResponse: () =>
        new Observable<string>((subscriber) => {
          subscriber.next("partial");
          subscriber.error(cause);
        }),
    });

    await expect(lastValueFrom(client.get("/partial").pipe(toArray()))).resolves.toEqual([
      "partial",
      "fallback",
      "finished",
    ]);
    expect(context.calls).toBe(1);
  });

  it.each([
    { expected: ["one", "two"], name: "Observable 多值", recover: () => of("one", "two") },
    { expected: ["async"], name: "Promise", recover: async () => "async" },
    {
      expected: ["one", "two"],
      name: "Promise 中的 Observable",
      recover: async () => of("one", "two"),
    },
    { expected: [[1, 2]], name: "普通数组", recover: () => [1, 2] },
    { expected: [], name: "空流", recover: () => EMPTY },
  ])("错误转换正确处理 $name", async ({ expected, recover }) => {
    const { instance } = createAxiosInstance(() => {
      throw new Error("network down");
    });
    const request$ = new RxHttpClient({ axiosInstance: instance, transformError: recover }).get(
      "/recover",
      { retryCount: 1 },
    );

    await expect(lastValueFrom(request$.pipe(toArray()))).resolves.toEqual(expected);
  });

  it("共享网络失败，但每个订阅者独立执行错误恢复并释放恢复流", async () => {
    const gate = deferred();
    const bothRecovering = deferred();
    const source = new Subject<number>();
    const finalized = vi.fn();
    const { context, instance } = createAxiosInstance(async () => {
      await gate.promise;
      throw new Error("network down");
    });
    let recoveryCount = 0;
    const transformError = vi.fn(() =>
      new Observable<number>((subscriber) => {
        recoveryCount += 1;
        if (recoveryCount === 2) bothRecovering.resolve();
        return source.subscribe(subscriber);
      }).pipe(finalize(finalized)),
    );
    const client = new RxHttpClient({ axiosInstance: instance, transformError });
    const firstValues: unknown[] = [];
    const first = client
      .get("/shared", { retryCount: 1 })
      .subscribe((value) => firstValues.push(value));
    const second = lastValueFrom(client.get("/shared", { retryCount: 1 }).pipe(toArray()));
    gate.resolve();
    await bothRecovering.promise;

    source.next(1);
    first.unsubscribe();
    source.next(2);
    source.complete();

    expect(firstValues).toEqual([1]);
    await expect(second).resolves.toEqual([1, 2]);
    expect(context.calls).toBe(1);
    expect(transformError).toHaveBeenCalledTimes(2);
    expect(finalized).toHaveBeenCalledTimes(2);
  });

  it("同一请求流每次订阅读取最新 token，转换后的头参与去重且请求级字段优先", async () => {
    let token = "first-token";
    const gate = deferred();
    const { context, instance } = createAxiosInstance(async (config) => {
      await gate.promise;
      return response(config, {}, 400);
    });
    const transformHeaders = vi.fn((headers: RawAxiosRequestHeaders) => ({
      ...headers,
      Authorization: `Bearer ${token}`,
    }));
    const client = new RxHttpClient({
      axiosInstance: instance,
      transformError: () => "recovered",
      transformHeaders,
    });
    const stream = client.get("/token");
    expect(transformHeaders).not.toHaveBeenCalled();
    const first = firstValueFrom(stream);
    token = "second-token";
    const second = firstValueFrom(stream);
    const duplicate = firstValueFrom(stream);
    const headers = { authorization: "Bearer request-token" };
    const override = firstValueFrom(client.get("/token", { headers }));
    gate.resolve();
    await Promise.all([first, second, duplicate, override]);

    expect(context.calls).toBe(3);
    expect(context.configs.map((config) => config.headers.get("Authorization"))).toEqual([
      "Bearer first-token",
      "Bearer second-token",
      "Bearer request-token",
    ]);
    expect(headers).toEqual({ authorization: "Bearer request-token" });
    expect(transformHeaders).toHaveBeenCalledTimes(4);
  });
});

describe("rxjs/http 参数校验的错误转换边界", () => {
  it("所有请求入口的非法参数均返回冷流，仅在订阅时进入 config 错误转换", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const transformError = vi.fn((error: HttpRequestError) => error.error.kind);
    const factory = vi.fn(() => of({}));
    const client = RxHttpClient.create(factory, { axiosInstance: instance, transformError });
    // 故意传入非法运行时数据，覆盖 JS 使用方和外部输入越过 TypeScript 的情况。
    const cases: Array<() => Observable<unknown>> = [
      () => client.request(null as never),
      () => client.request({ method: "invalid" as never, url: "/invalid" }),
      () => client.request({ method: "GET", url: 123 as never }),
      () => client.get("/invalid", null as never),
      () => client.post("/invalid", {}, null as never),
      () => client.put("/invalid", {}, null as never),
      () => client.patch("/invalid", {}, null as never),
      () => client.delete("/invalid", null as never),
      () => client.get("/invalid", { retryCount: 0 }),
      () => client.get("/invalid", { signal: null as never }),
    ];

    for (const createRequest of cases) {
      const calls = transformError.mock.calls.length;
      const stream = createRequest();
      expect(stream).toBeInstanceOf(Observable);
      expect(transformError).toHaveBeenCalledTimes(calls);
      await expect(firstValueFrom(stream)).resolves.toBe("config");
      await expect(firstValueFrom(stream)).resolves.toBe("config");
      expect(transformError).toHaveBeenCalledTimes(calls + 2);
      expect(transformError.mock.calls[calls]?.[0].error.cause).toBeInstanceOf(TypeError);
    }
    expect(context.calls).toBe(0);
    expect(factory).not.toHaveBeenCalled();
  });

  it("未配置错误转换仍同步校验，构造阶段的非法配置始终同步抛错", () => {
    const client = new RxHttpClient();
    expect(() => client.get("/invalid", null as never)).toThrow(TypeError);
    expect(() => client.post("/invalid", {}, { retryCount: 0 })).toThrow(TypeError);
    expect(() => client.request({ method: "invalid" as never, url: "/invalid" })).toThrow(
      TypeError,
    );
    const transformError = vi.fn(() => "fallback");
    expect(() => new RxHttpClient({ retryCount: 0, transformError })).toThrow(TypeError);
    expect(() => new RxHttpClient({ transformError: null as never })).toThrow("transformError");
    expect(transformError).not.toHaveBeenCalled();
  });
});

describe("rxjs/http 错误恢复与取消生命周期", () => {
  it.each([
    false,
    true,
  ])("主动退订不执行错误转换，保留 cancelOnNoSubscribers=%s", async (cancelOnNoSubscribers) => {
    vi.useFakeTimers();
    const pending = createPendingAxiosInstance();
    const transformError = vi.fn(() => "fallback");
    const next = vi.fn();
    const subscription = new RxHttpClient({
      axiosInstance: pending.instance,
      cancelOnNoSubscribers,
      transformError,
    })
      .get("/unsubscribe")
      .subscribe({ next });
    await pending.started;
    subscription.unsubscribe();
    expect(pending.abortCount).toBe(cancelOnNoSubscribers ? 1 : 0);
    pending.complete();
    await vi.runAllTimersAsync();

    expect(transformError).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("重试等待期间退订会释放定时器，不发送后续请求或合成结果", async () => {
    vi.useFakeTimers();
    const { context, instance, started } = createAxiosInstance(() => {
      throw new Error("network down");
    });
    const transformError = vi.fn(() => "fallback");
    const subscription = new RxHttpClient({
      axiosInstance: instance,
      cancelOnNoSubscribers: true,
      retryDelay: 100,
      transformError,
    })
      .get("/retry-unsubscribe")
      .subscribe();
    await started;
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    subscription.unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();

    expect(context.calls).toBe(1);
    expect(transformError).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
  ])("显式取消进入错误转换，其恢复流仍可正常发值（订阅前取消=%s）", async (abortBeforeSubscribe) => {
    const pending = createPendingAxiosInstance();
    const controller = new AbortController();
    const transformError = vi.fn((error: HttpRequestError) => of(error.error.kind, "finished"));
    const client = new RxHttpClient({ axiosInstance: pending.instance, transformError });
    const request$ = client.get("/abort", { signal: controller.signal });
    if (abortBeforeSubscribe) controller.abort();
    const result = lastValueFrom(request$.pipe(toArray()));
    if (!abortBeforeSubscribe) {
      await pending.started;
      controller.abort();
    }

    await expect(result).resolves.toEqual(["cancel", "finished"]);
    expect(transformError).toHaveBeenCalledOnce();
    expect(pending.context.calls).toBe(abortBeforeSubscribe ? 0 : 1);
    expect(pending.abortCount).toBe(abortBeforeSubscribe ? 0 : 1);
  });

  it("显式取消在重试等待期间也恢复一次并释放等待", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { context, instance, started } = createAxiosInstance(() => {
      throw new Error("network down");
    });
    const transformError = vi.fn((error: HttpRequestError) => error.error.kind);
    const result = firstValueFrom(
      new RxHttpClient({
        axiosInstance: instance,
        retryDelay: 100,
        transformError,
      }).get("/retry-abort", { signal: controller.signal }),
    );
    await started;
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();

    await expect(result).resolves.toBe("cancel");
    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();
    expect(context.calls).toBe(1);
    expect(transformError).toHaveBeenCalledOnce();
  });

  it("配置初始化期间显式取消只恢复当前订阅，不中断其他订阅的共享初始化", async () => {
    const controller = new AbortController();
    const gate = deferred<Partial<HttpClientConfig>>();
    const factory = vi.fn(() => from(gate.promise));
    const { context, instance } = createAxiosInstance((config) => response(config));
    const transformError = vi.fn((error: HttpRequestError) => error.error.kind);
    const client = RxHttpClient.create(factory, { axiosInstance: instance, transformError });
    const aborted = firstValueFrom(client.get("/cancel-config", { signal: controller.signal }));
    const survivor = firstValueFrom(client.get("/continue-config"));
    controller.abort();

    await expect(aborted).resolves.toBe("cancel");
    expect(context.calls).toBe(0);
    expect(factory).toHaveBeenCalledOnce();
    gate.resolve({});
    await expect(survivor).resolves.toMatchObject({ success: true });
    expect(context.calls).toBe(1);
    expect(transformError).toHaveBeenCalledOnce();
  });

  it.each([
    "network",
    "parameter",
    "url",
    "adapter-cancel",
  ])("%s 错误的恢复流仍响应后续取消并释放订阅，不递归恢复", async (kind) => {
    const controller = new AbortController();
    const recovering = deferred();
    const source = new Subject<string>();
    const finalized = vi.fn();
    const { context, instance } = createAxiosInstance(() => {
      if (kind === "adapter-cancel")
        throw new AxiosError("adapter canceled", AxiosError.ERR_CANCELED);
      throw new Error("network down");
    });
    const transformError = vi.fn(() =>
      new Observable<string>((subscriber) => {
        subscriber.next("initial");
        recovering.resolve();
        return source.subscribe(subscriber);
      }).pipe(finalize(finalized)),
    );
    const values: unknown[] = [];
    const finished = deferred<unknown>();
    new RxHttpClient({ axiosInstance: instance, transformError })
      // 故意传入非法参数，验证错误恢复期间仍保留合法 signal。
      .get(kind === "url" ? (42 as never) : "/recovery-abort", {
        retryCount: kind === "parameter" ? 0 : 1,
        signal: controller.signal,
      })
      .subscribe({ error: finished.resolve, next: (value) => values.push(value) });
    await recovering.promise;
    controller.abort();

    expect(await finished.promise).toMatchObject({ error: { kind: "cancel" } });
    source.next("too late");
    source.complete();
    expect(values).toEqual(["initial"]);
    expect(finalized).toHaveBeenCalledOnce();
    expect(transformError).toHaveBeenCalledOnce();
    expect(context.calls).toBe(kind === "parameter" || kind === "url" ? 0 : 1);
  });
});
