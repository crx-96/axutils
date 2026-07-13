import axios, {
  type AxiosAdapter,
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { firstValueFrom, forkJoin, map, of, throwError, timer } from "rxjs";
import { describe, expect, it } from "vitest";

import { type HttpClientConfig, HttpRequestError, RxHttpClient } from "../../src/rxjs/http";

interface AdapterContext {
  calls: number;
  configs: InternalAxiosRequestConfig[];
}

type AdapterHandler = (
  config: InternalAxiosRequestConfig,
  context: AdapterContext,
) => Promise<AxiosResponse<unknown>> | AxiosResponse<unknown>;

const createAxiosInstance = (handler: AdapterHandler) => {
  const context: AdapterContext = { calls: 0, configs: [] };
  const adapter: AxiosAdapter = async (config) => {
    context.calls += 1;
    context.configs.push(config);
    const result = await handler(config, context);
    // 自定义 adapter 需要自行执行 Axios 默认的 2xx 状态判断；这里模拟真实 adapter 的 settle 行为。
    if (result.status < 200 || result.status >= 300) {
      throw new AxiosError(
        `Request failed with status code ${result.status}`,
        AxiosError.ERR_BAD_RESPONSE,
        config,
        undefined,
        result,
      );
    }
    return result;
  };

  return { context, instance: axios.create({ adapter }) };
};

const response = (
  config: InternalAxiosRequestConfig,
  data: unknown = { ok: true },
  status = 200,
): AxiosResponse<unknown> => ({
  config,
  data,
  headers: {},
  status,
  statusText: status === 200 ? "OK" : "Error",
});

const createPendingAxiosInstance = () => {
  let resolveStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  let abortCount = 0;
  const { context, instance } = createAxiosInstance((config) => {
    resolveStarted();
    return new Promise<AxiosResponse<unknown>>((_, reject) => {
      const rejectCanceled = () => {
        abortCount += 1;
        reject(new AxiosError("canceled", AxiosError.ERR_CANCELED, config));
      };
      if (config.signal?.aborted) {
        rejectCanceled();
        return;
      }
      config.signal?.addEventListener?.("abort", rejectCanceled, { once: true });
    });
  });
  return {
    context,
    instance,
    started,
    get abortCount() {
      return abortCount;
    },
  };
};

const requestError = async (stream: ReturnType<RxHttpClient["get"]>) => {
  try {
    await firstValueFrom(stream);
    throw new Error("请求应该失败");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpRequestError);
    return error as HttpRequestError;
  }
};

describe("rxjs/http", () => {
  it("默认 baseUrl 为空字符串，并统一返回 HTTP 成功结果", async () => {
    const { context, instance } = createAxiosInstance((config) =>
      Promise.resolve(response(config, { code: "业务字段不会覆盖 HTTP 状态" }, 201)),
    );
    const client = new RxHttpClient({ axiosInstance: instance });

    const result = await firstValueFrom(client.get("/users"));

    expect(context.configs[0]?.url).toBe("/users");
    expect(context.configs[0]?.baseURL ?? "").toBe("");
    expect(result).toEqual({
      code: 201,
      success: true,
      data: { code: "业务字段不会覆盖 HTTP 状态" },
      error: null,
    });
  });

  it("拼接自定义 baseUrl，但绝对 URL 保持不变", async () => {
    const { context, instance } = createAxiosInstance((config) =>
      Promise.resolve(response(config)),
    );
    const client = new RxHttpClient({
      baseUrl: "https://api.example.test/v1/",
      axiosInstance: instance,
    });

    await firstValueFrom(client.get("/relative"));
    await firstValueFrom(client.get("https://other.example.test/absolute"));

    expect(context.configs.map((config) => config.url)).toEqual([
      "https://api.example.test/v1/relative",
      "https://other.example.test/absolute",
    ]);
  });

  it("HTTP、网络、超时和取消错误统一通过 error 通道返回", async () => {
    const cases: Array<{
      kind: "network" | "timeout" | "cancel";
      makeError: (config: InternalAxiosRequestConfig) => Error;
      code: number;
    }> = [
      {
        kind: "network",
        makeError: (config) => new AxiosError("network error", AxiosError.ERR_NETWORK, config),
        code: 0,
      },
      {
        kind: "timeout",
        makeError: (config) => new AxiosError("timeout", AxiosError.ETIMEDOUT, config),
        code: 0,
      },
      {
        kind: "cancel",
        makeError: (config) => new AxiosError("canceled", AxiosError.ERR_CANCELED, config),
        code: 0,
      },
    ];

    for (const item of cases) {
      const { instance } = createAxiosInstance((config) => Promise.reject(item.makeError(config)));
      const client = new RxHttpClient({ axiosInstance: instance });
      const error = await requestError(client.get("/failure", { retryCount: 1 }));

      expect(error.code).toBe(item.code);
      expect(error.success).toBe(false);
      expect(error.data).toBeNull();
      expect(error.error.kind).toBe(item.kind);
      expect(error.error.cause).toBeInstanceOf(AxiosError);
    }

    const { instance: httpInstance } = createAxiosInstance((config) =>
      Promise.resolve(response(config, { reason: "server" }, 500)),
    );
    const httpError = await requestError(
      new RxHttpClient({ axiosInstance: httpInstance }).get("/server", { retryCount: 1 }),
    );
    expect(httpError.code).toBe(500);
    expect(httpError.error.kind).toBe("http");
  });

  it("配置工厂在订阅前不执行，首次成功后缓存配置", async () => {
    let factoryCalls = 0;
    const { context, instance } = createAxiosInstance((config) =>
      Promise.resolve(response(config)),
    );
    const client = RxHttpClient.create(
      () => {
        factoryCalls += 1;
        return of<Partial<HttpClientConfig>>({
          baseUrl: "https://config.example.test",
          retryCount: 1,
        });
      },
      { axiosInstance: instance },
    );

    const first = client.get("/first");
    expect(factoryCalls).toBe(0);
    await firstValueFrom(first);
    await firstValueFrom(client.get("/second"));

    expect(factoryCalls).toBe(1);
    expect(context.configs[0]?.url).toBe("https://config.example.test/first");
    expect(context.configs[1]?.url).toBe("https://config.example.test/second");
  });

  it("并发首请求只触发一次配置工厂", async () => {
    let factoryCalls = 0;
    const { instance } = createAxiosInstance((config) => Promise.resolve(response(config)));
    const client = RxHttpClient.create(
      () => {
        factoryCalls += 1;
        // 延迟让两个请求都进入配置初始化的共享流。
        return timer(5).pipe(map(() => ({ retryCount: 1 }) as Partial<HttpClientConfig>));
      },
      { axiosInstance: instance },
    );

    await firstValueFrom(forkJoin([client.get("/one"), client.get("/two")]));

    expect(factoryCalls).toBe(1);
  });

  it("配置失败最多总尝试三次，失败后下一次请求可以重新初始化", async () => {
    let factoryCalls = 0;
    const { instance } = createAxiosInstance((config) => Promise.resolve(response(config)));
    const client = RxHttpClient.create(
      () => {
        factoryCalls += 1;
        if (factoryCalls <= 3) {
          return throwError(() => new Error("配置暂不可用"));
        }
        return of<Partial<HttpClientConfig>>({ retryCount: 1 });
      },
      { axiosInstance: instance },
    );

    const firstError = await requestError(client.get("/first"));
    expect(firstError.error.kind).toBe("config");
    expect(factoryCalls).toBe(3);

    await firstValueFrom(client.get("/second"));
    expect(factoryCalls).toBe(4);
  });

  it("默认最多总尝试三次，retryCount: 1 表示不重试", async () => {
    const retrying = createAxiosInstance((config, context) => {
      if (context.calls < 3) {
        return Promise.reject(new Error("network down"));
      }
      return Promise.resolve(response(config));
    });
    await firstValueFrom(new RxHttpClient({ axiosInstance: retrying.instance }).get("/retry"));
    expect(retrying.context.calls).toBe(3);

    const noRetry = createAxiosInstance(() => Promise.reject(new Error("network down")));
    await requestError(
      new RxHttpClient({ axiosInstance: noRetry.instance }).get("/no-retry", { retryCount: 1 }),
    );
    expect(noRetry.context.calls).toBe(1);
  });

  it("默认不重试可能重复提交的非幂等方法，显式开启后才重试", async () => {
    const noRetry = createAxiosInstance((config, context) => {
      if (context.calls === 1) return Promise.reject(new Error("network down"));
      return Promise.resolve(response(config));
    });
    await requestError(
      new RxHttpClient({ axiosInstance: noRetry.instance }).post(
        "/write-once",
        { value: 1 },
        { retryCount: 3 },
      ),
    );
    expect(noRetry.context.calls).toBe(1);

    const retryable = createAxiosInstance((config, context) => {
      if (context.calls < 3) return Promise.reject(new Error("network down"));
      return Promise.resolve(response(config));
    });
    await firstValueFrom(
      new RxHttpClient({ axiosInstance: retryable.instance }).post(
        "/write-once",
        { value: 1 },
        { retryCount: 3, retryNonIdempotent: true },
      ),
    );
    expect(retryable.context.calls).toBe(3);
  });

  it("AbortSignal 在重试等待期间会立即结束请求且不会发起下一次尝试", async () => {
    const controller = new AbortController();
    let resolveFirstAttempt!: () => void;
    const firstAttempt = new Promise<void>((resolve) => {
      resolveFirstAttempt = resolve;
    });
    const retryable = createAxiosInstance((config, context) => {
      if (context.calls === 1) {
        resolveFirstAttempt();
        return Promise.reject(new Error("network down"));
      }
      if (config.signal?.aborted) {
        return Promise.reject(new AxiosError("canceled", AxiosError.ERR_CANCELED, config));
      }
      return Promise.resolve(response(config));
    });
    const errorPromise = requestError(
      new RxHttpClient({ axiosInstance: retryable.instance }).get("/abort-during-retry-delay", {
        retryCount: 3,
        retryDelay: 200,
        signal: controller.signal,
      }),
    );

    await firstAttempt;
    await firstValueFrom(timer(0));
    controller.abort();

    const result = await Promise.race([
      errorPromise.then((error) => ({ timely: true, error })),
      firstValueFrom(timer(50)).then(() => ({ timely: false, error: undefined })),
    ]);
    if (!result.timely) {
      // 失败实现会在 retryDelay 到期后才结束，等待它收尾以避免测试留下后台订阅。
      await errorPromise;
    }

    expect(result.timely).toBe(true);
    expect(result.error?.error.kind).toBe("cancel");
    expect(retryable.context.calls).toBe(1);
  });

  it("AbortSignal 在异步配置尚未完成时会立即结束请求", async () => {
    const controller = new AbortController();
    const { context, instance } = createAxiosInstance((config) => {
      if (config.signal?.aborted) {
        return Promise.reject(new AxiosError("canceled", AxiosError.ERR_CANCELED, config));
      }
      return Promise.resolve(response(config));
    });
    const client = RxHttpClient.create(() => timer(200).pipe(map(() => ({ retryCount: 1 }))), {
      axiosInstance: instance,
    });
    const errorPromise = requestError(
      client.get("/abort-during-config", { signal: controller.signal }),
    );

    await firstValueFrom(timer(10));
    controller.abort();

    const result = await Promise.race([
      errorPromise.then((error) => ({ timely: true, error })),
      firstValueFrom(timer(50)).then(() => ({ timely: false, error: undefined })),
    ]);
    if (!result.timely) {
      // 失败实现会等配置流结束后才发现 signal 已取消，等待它收尾以避免测试留下后台订阅。
      await errorPromise;
    }

    expect(result.timely).toBe(true);
    expect(result.error?.error.kind).toBe("cancel");
    expect(context.calls).toBe(0);
  });

  it.each([
    { name: "网络错误", status: undefined },
    { name: "超时", status: undefined, timeout: true },
    { name: "429", status: 429 },
    { name: "5xx", status: 503 },
  ])("$name 会重试，4xx 不会重试", async ({ status, timeout }) => {
    const retryable = createAxiosInstance((config, context) => {
      if (context.calls < 3) {
        if (timeout) {
          return Promise.reject(new AxiosError("timeout", AxiosError.ETIMEDOUT, config));
        }
        if (status !== undefined) {
          return Promise.resolve(response(config, { status }, status));
        }
        return Promise.reject(new Error("network down"));
      }
      return Promise.resolve(response(config));
    });

    await firstValueFrom(new RxHttpClient({ axiosInstance: retryable.instance }).get("/retryable"));
    expect(retryable.context.calls).toBe(3);

    const noRetry4xx = createAxiosInstance((config) => Promise.resolve(response(config, {}, 400)));
    await requestError(
      new RxHttpClient({ axiosInstance: noRetry4xx.instance }).get("/bad-request"),
    );
    expect(noRetry4xx.context.calls).toBe(1);
  });

  it("retryable: false 禁用请求重试，但不影响请求错误归类", async () => {
    const { context, instance } = createAxiosInstance(() =>
      Promise.reject(new Error("network down")),
    );
    const error = await requestError(
      new RxHttpClient({ axiosInstance: instance }).get("/no-request-retry", {
        retryable: false,
      }),
    );

    expect(context.calls).toBe(1);
    expect(error.error.kind).toBe("network");
  });

  it("相同请求只执行一次，字段顺序不同仍可去重且共享同一个结果对象", async () => {
    const { context, instance } = createAxiosInstance(
      (config) =>
        new Promise((resolve) => {
          setTimeout(() => resolve(response(config, { shared: true })), 5);
        }),
    );
    const client = new RxHttpClient({ axiosInstance: instance });
    const first = client.post(
      "/dedupe",
      { b: 2, a: 1 },
      { params: { z: 3, a: 1 }, headers: { "x-b": "2", "x-a": "1" }, retryCount: 1 },
    );
    const second = client.post(
      "/dedupe",
      { a: 1, b: 2 },
      { params: { a: 1, z: 3 }, headers: { "x-a": "1", "x-b": "2" }, retryCount: 1 },
    );

    const [firstResult, secondResult] = await firstValueFrom(forkJoin([first, second]));

    expect(context.calls).toBe(1);
    expect(firstResult).toBe(secondResult);
  });

  it("默认不取消底层请求时，最后一个订阅者离开后仍复用未完成请求", async () => {
    let releaseRequest!: () => void;
    const requestReleased = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    const { context, instance } = createAxiosInstance((config) =>
      requestReleased.then(() => response(config, { shared: true })),
    );
    const client = new RxHttpClient({ axiosInstance: instance });
    const firstSubscription = client.get("/keep-deduped", { retryCount: 1 }).subscribe();

    expect(context.calls).toBe(1);
    firstSubscription.unsubscribe();

    const secondResult = firstValueFrom(client.get("/keep-deduped", { retryCount: 1 }));
    expect(context.calls).toBe(1);
    releaseRequest();

    await expect(secondResult).resolves.toMatchObject({ success: true, data: { shared: true } });
  });

  it("开启 cancelOnNoSubscribers 后，只有最后一个订阅者取消才会中止共享请求", async () => {
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    let abortCount = 0;
    const { context, instance } = createAxiosInstance((config) => {
      resolveStarted();
      return new Promise<AxiosResponse<unknown>>((_, reject) => {
        const signal = config.signal as AbortSignal | undefined;
        const rejectCanceled = () => {
          abortCount += 1;
          reject(new AxiosError("canceled", AxiosError.ERR_CANCELED, config));
        };
        if (signal?.aborted) {
          rejectCanceled();
          return;
        }
        signal?.addEventListener("abort", rejectCanceled, { once: true });
      });
    });
    const client = new RxHttpClient({ axiosInstance: instance });
    const options = { retryCount: 1, cancelOnNoSubscribers: true };
    const firstSubscription = client.get("/cancel-on-last", options).subscribe({
      error: () => undefined,
    });
    const secondSubscription = client.get("/cancel-on-last", options).subscribe({
      error: () => undefined,
    });

    try {
      await started;
      firstSubscription.unsubscribe();
      await firstValueFrom(timer(0));
      expect(abortCount).toBe(0);

      secondSubscription.unsubscribe();
      await firstValueFrom(timer(0));
      expect(abortCount).toBe(1);
      expect(context.calls).toBe(1);
    } finally {
      firstSubscription.unsubscribe();
      secondSubscription.unsubscribe();
    }
  });

  it("开启 cancelOnNoSubscribers 后，非去重请求取消订阅也会中止底层请求", async () => {
    const pending = createPendingAxiosInstance();
    const subscription = new RxHttpClient({
      axiosInstance: pending.instance,
      cancelOnNoSubscribers: true,
    })
      .get("/cancel-single", { retryCount: 1, dedupe: false })
      .subscribe({ error: () => undefined });

    await pending.started;
    subscription.unsubscribe();
    await firstValueFrom(timer(0));

    expect(pending.abortCount).toBe(1);
    expect(pending.context.calls).toBe(1);
  });

  it("cancelOnNoSubscribers 默认为 false，取消订阅不会主动中止请求", async () => {
    const pending = createPendingAxiosInstance();
    const subscription = new RxHttpClient({ axiosInstance: pending.instance })
      .get("/keep-running", { retryCount: 1 })
      .subscribe({ error: () => undefined });

    await pending.started;
    subscription.unsubscribe();
    await firstValueFrom(timer(0));

    expect(pending.abortCount).toBe(0);
    expect(pending.context.calls).toBe(1);
  });

  it("订阅前 AbortSignal 已取消时不会发起底层请求", async () => {
    const { context, instance } = createAxiosInstance((config) => {
      if (config.signal?.aborted) {
        return Promise.reject(new AxiosError("canceled", AxiosError.ERR_CANCELED, config));
      }
      return Promise.resolve(response(config));
    });
    const controller = new AbortController();
    const request$ = new RxHttpClient({ axiosInstance: instance }).get(
      "/aborted-before-subscribe",
      { signal: controller.signal },
    );
    controller.abort();

    const error = await requestError(request$);

    expect(error.error.kind).toBe("cancel");
    expect(context.calls).toBe(0);
  });

  it("自动取消只作用于尚未完成的请求，正常完成不会额外触发 abort", async () => {
    let abortCount = 0;
    const { instance } = createAxiosInstance(
      (config) =>
        new Promise((resolve) => {
          config.signal?.addEventListener?.(
            "abort",
            () => {
              abortCount += 1;
            },
            { once: true },
          );
          setTimeout(() => resolve(response(config)), 5);
        }),
    );

    await firstValueFrom(
      new RxHttpClient({ axiosInstance: instance }).get("/completed", {
        retryCount: 1,
        cancelOnNoSubscribers: true,
      }),
    );

    expect(abortCount).toBe(0);
  });

  it("开启自动取消时仍会响应调用方传入的 AbortSignal", async () => {
    const pending = createPendingAxiosInstance();
    const controller = new AbortController();
    const errorPromise = requestError(
      new RxHttpClient({ axiosInstance: pending.instance }).get("/caller-signal", {
        retryCount: 1,
        cancelOnNoSubscribers: true,
        signal: controller.signal,
      }),
    );

    await pending.started;
    controller.abort();
    const error = await errorPromise;

    expect(error.error.kind).toBe("cancel");
    expect(pending.abortCount).toBe(1);
  });

  it("带 AbortSignal 的请求不共享去重结果，调用方可以分别取消", async () => {
    const pending = createPendingAxiosInstance();
    const firstController = new AbortController();
    const secondController = new AbortController();
    const client = new RxHttpClient({ axiosInstance: pending.instance });
    const firstErrorPromise = requestError(
      client.get("/signal-dedupe", { retryCount: 1, signal: firstController.signal }),
    );
    const secondErrorPromise = requestError(
      client.get("/signal-dedupe", { retryCount: 1, signal: secondController.signal }),
    );

    try {
      await pending.started;
      await firstValueFrom(timer(0));
      expect(pending.context.calls).toBe(2);

      secondController.abort();
      const secondError = await Promise.race([
        secondErrorPromise,
        firstValueFrom(timer(50)).then(() => undefined),
      ]);
      expect(secondError).toBeInstanceOf(HttpRequestError);
      expect(secondError?.error.kind).toBe("cancel");
    } finally {
      firstController.abort();
      secondController.abort();
      await Promise.all([firstErrorPromise, secondErrorPromise]);
    }
  });

  it("method、body、headers 不同不会错误去重，完成后再次请求会重新发起", async () => {
    const { context, instance } = createAxiosInstance((config) =>
      Promise.resolve(response(config)),
    );
    const client = new RxHttpClient({ axiosInstance: instance });

    await firstValueFrom(
      forkJoin([
        client.get("/different"),
        client.post("/different", { value: 1 }),
        client.post("/different", { value: 2 }),
      ]),
    );
    await firstValueFrom(client.get("/different"));

    expect(context.calls).toBe(4);
  });

  it("两个订阅者在共享失败时收到同一个 HttpRequestError 实例", async () => {
    const { instance } = createAxiosInstance(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("network down")), 5);
        }),
    );
    const client = new RxHttpClient({ axiosInstance: instance });
    const stream = client.get("/same-error", { retryCount: 1 });
    let firstError: unknown;
    let secondError: unknown;

    await new Promise<void>((resolve) => {
      let errors = 0;
      const onError = () => {
        errors += 1;
        if (errors === 2) resolve();
      };
      stream.subscribe({
        error: (error) => {
          firstError = error;
          onError();
        },
      });
      stream.subscribe({
        error: (error) => {
          secondError = error;
          onError();
        },
      });
    });

    expect(firstError).toBeInstanceOf(HttpRequestError);
    expect(firstError).toBe(secondError);
  });

  it("无法稳定 JSON 序列化的请求体默认不去重，提供 dedupeKey 后可以去重", async () => {
    const noKey = createAxiosInstance((config) => Promise.resolve(response(config)));
    const noKeyClient = new RxHttpClient({ axiosInstance: noKey.instance });
    await firstValueFrom(
      forkJoin([
        noKeyClient.post("/map", new Map([["a", 1]]), { retryCount: 1 }),
        noKeyClient.post("/map", new Map([["a", 1]]), { retryCount: 1 }),
      ]),
    );
    expect(noKey.context.calls).toBe(2);

    const withKey = createAxiosInstance((config) => Promise.resolve(response(config)));
    const withKeyClient = new RxHttpClient({ axiosInstance: withKey.instance });
    await firstValueFrom(
      forkJoin([
        withKeyClient.post("/map", new Map([["a", 1]]), { retryCount: 1, dedupeKey: "map-a" }),
        withKeyClient.post("/map", new Map([["a", 1]]), { retryCount: 1, dedupeKey: "map-a" }),
      ]),
    );
    expect(withKey.context.calls).toBe(1);

    const sameKeyDifferentUrl = createAxiosInstance(
      (config) =>
        new Promise((resolve) => {
          setTimeout(() => resolve(response(config)), 5);
        }),
    );
    const sameKeyClient = new RxHttpClient({ axiosInstance: sameKeyDifferentUrl.instance });
    await firstValueFrom(
      forkJoin([
        sameKeyClient.post("/upload/a", new Map([["a", 1]]), {
          retryCount: 1,
          dedupeKey: "same-upload",
        }),
        sameKeyClient.post("/upload/b", new Map([["a", 1]]), {
          retryCount: 1,
          dedupeKey: "same-upload",
        }),
      ]),
    );
    expect(sameKeyDifferentUrl.context.calls).toBe(2);
  });

  it("配置或请求选项为 null 时不会静默回退到默认值", async () => {
    expect(() => new RxHttpClient({ retryCount: null as never })).toThrow(TypeError);
    expect(() => new RxHttpClient({ retryable: null as never })).toThrow(TypeError);

    const { instance } = createAxiosInstance((config) => Promise.resolve(response(config)));
    const client = new RxHttpClient({ axiosInstance: instance });
    expect(() => client.get("/invalid-null", { retryCount: null as never })).toThrow("retryCount");
    expect(() => client.get("/invalid-null", { retryNonIdempotent: null as never })).toThrow(
      "retryNonIdempotent",
    );
  });

  it("拒绝整个 null 请求选项、null axiosInstance 和 null signal", () => {
    expect(() => new RxHttpClient({ axiosInstance: null as never })).toThrow("axiosInstance");

    const { instance } = createAxiosInstance((config) => Promise.resolve(response(config)));
    const client = new RxHttpClient({ axiosInstance: instance });

    expect(() => client.get("/invalid-options", null as never)).toThrow("HttpRequestOptions");
    expect(() => client.post("/invalid-options", {}, null as never)).toThrow("HttpRequestOptions");
    expect(() => client.get("/invalid-signal", { signal: null as never })).toThrow("signal");
  });

  it("不会修改调用方传入的 params、data 和 headers", async () => {
    const { instance } = createAxiosInstance((config) => Promise.resolve(response(config)));
    const client = new RxHttpClient({ axiosInstance: instance });
    const params = { b: 2, a: 1 };
    const data = { nested: { value: 1 } };
    const headers = { "x-test": "value" };
    const before = JSON.stringify({ params, data, headers });

    await firstValueFrom(client.post("/immutable-input", data, { params, headers }));

    expect(JSON.stringify({ params, data, headers })).toBe(before);
  });
});
