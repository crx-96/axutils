import axios, {
  type AxiosAdapter,
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { describe, expect, it } from "vitest";

import {
  PromiseHttpClient,
  type PromiseHttpClientConfig,
  PromiseHttpRequestError,
} from "../../src/axios/http";

interface AdapterContext {
  calls: number;
  configs: InternalAxiosRequestConfig[];
}

type AdapterHandler = (
  config: InternalAxiosRequestConfig,
  context: AdapterContext,
) => Promise<AxiosResponse<unknown>> | AxiosResponse<unknown>;

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

const createAxiosInstance = (handler: AdapterHandler) => {
  const context: AdapterContext = { calls: 0, configs: [] };
  const adapter: AxiosAdapter = async (config) => {
    context.calls += 1;
    context.configs.push(config);
    const result = await handler(config, context);
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

const expectRequestError = async (request: Promise<unknown>) => {
  try {
    await request;
    throw new Error("请求应该失败");
  } catch (error) {
    expect(error).toBeInstanceOf(PromiseHttpRequestError);
    return error as PromiseHttpRequestError;
  }
};

describe("axios/http", () => {
  it("立即执行请求并统一返回 HTTP 成功结果", async () => {
    const { context, instance } = createAxiosInstance((config) =>
      response(config, { code: "业务字段不会覆盖 HTTP 状态" }, 201),
    );
    const client = new PromiseHttpClient({ axiosInstance: instance });

    const request = client.get("/users");
    await Promise.resolve();
    expect(context.calls).toBe(1);
    const result = await request;

    expect(context.configs[0]?.url).toBe("/users");
    expect(result).toEqual({
      code: 201,
      success: true,
      data: { code: "业务字段不会覆盖 HTTP 状态" },
      error: null,
    });
  });

  it("拼接 baseUrl，并传递 params、headers、data 和 timeout", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = new PromiseHttpClient({
      baseUrl: "https://api.example.test/v1/",
      axiosInstance: instance,
    });

    await client.post(
      "/users",
      { name: "Ada" },
      { params: { page: 1 }, headers: { "x-test": "yes" }, timeout: 1000 },
    );
    await client.get("https://other.example.test/absolute");

    expect(context.configs[0]).toMatchObject({
      url: "https://api.example.test/v1/users",
      params: { page: 1 },
      headers: { "x-test": "yes" },
      data: JSON.stringify({ name: "Ada" }),
      timeout: 1000,
    });
    expect(context.configs[1]?.url).toBe("https://other.example.test/absolute");
  });

  it("异步配置在首次请求时执行、成功缓存，并发请求共享一次初始化", async () => {
    let resolveConfig!: (config: Partial<PromiseHttpClientConfig>) => void;
    let factoryCalls = 0;
    const configPromise = new Promise<Partial<PromiseHttpClientConfig>>((resolve) => {
      resolveConfig = resolve;
    });
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = PromiseHttpClient.create(
      () => {
        factoryCalls += 1;
        return configPromise;
      },
      { axiosInstance: instance },
    );

    const first = client.get("/first");
    const second = client.get("/second");
    expect(factoryCalls).toBe(1);
    expect(context.calls).toBe(0);

    resolveConfig({ baseUrl: "https://api.example.test" });
    await Promise.all([first, second]);
    await client.get("/third");

    expect(factoryCalls).toBe(1);
    expect(context.configs.map((config) => config.url)).toEqual([
      "https://api.example.test/first",
      "https://api.example.test/second",
      "https://api.example.test/third",
    ]);
  });

  it("异步配置失败不缓存，并按同步 retryCount 重试", async () => {
    let factoryCalls = 0;
    const { instance } = createAxiosInstance((config) => response(config));
    const client = PromiseHttpClient.create(
      () => {
        factoryCalls += 1;
        return Promise.reject(new Error("配置暂不可用"));
      },
      { axiosInstance: instance, retryCount: 2 },
    );

    const firstError = await expectRequestError(client.get("/first"));
    expect(firstError.error.kind).toBe("config");
    expect(factoryCalls).toBe(2);

    await expectRequestError(client.get("/second"));
    expect(factoryCalls).toBe(4);
  });

  it("按规则重试安全方法和 429/5xx，非幂等方法默认不重试", async () => {
    const retrying = createAxiosInstance((config, context) => {
      if (context.calls < 3) {
        return Promise.reject(new AxiosError("network down", AxiosError.ERR_NETWORK, config));
      }
      return response(config);
    });
    await new PromiseHttpClient({ axiosInstance: retrying.instance }).get("/retry");
    expect(retrying.context.calls).toBe(3);

    const noRetry = createAxiosInstance(() => Promise.reject(new Error("network down")));
    await expectRequestError(
      new PromiseHttpClient({ axiosInstance: noRetry.instance }).post("/write", { value: 1 }),
    );
    expect(noRetry.context.calls).toBe(1);

    const retryNonIdempotent = createAxiosInstance((config, context) => {
      if (context.calls < 2) {
        return Promise.reject(new AxiosError("network down", AxiosError.ERR_NETWORK, config));
      }
      return response(config);
    });
    await new PromiseHttpClient({ axiosInstance: retryNonIdempotent.instance }).post(
      "/write",
      { value: 1 },
      { retryNonIdempotent: true },
    );
    expect(retryNonIdempotent.context.calls).toBe(2);
  });

  it("retryable: false、4xx 和配置错误不会重试", async () => {
    const noRetry = createAxiosInstance(() => Promise.reject(new Error("network down")));
    const error = await expectRequestError(
      new PromiseHttpClient({ axiosInstance: noRetry.instance }).get("/network", {
        retryable: false,
      }),
    );
    expect(error.error.kind).toBe("unknown");
    expect(noRetry.context.calls).toBe(1);

    const badRequest = createAxiosInstance((config) => response(config, {}, 400));
    const badRequestError = await expectRequestError(
      new PromiseHttpClient({ axiosInstance: badRequest.instance }).get("/bad"),
    );
    expect(badRequestError.code).toBe(400);
    expect(badRequestError.error.kind).toBe("http");
    expect(badRequest.context.calls).toBe(1);

    const configError = createAxiosInstance(() =>
      Promise.reject(new AxiosError("bad option", AxiosError.ERR_BAD_OPTION)),
    );
    const configRequestError = await expectRequestError(
      new PromiseHttpClient({ axiosInstance: configError.instance }).get("/config"),
    );
    expect(configRequestError.error.kind).toBe("config");
  });

  it("AbortSignal 可以取消调用前、retry delay 和 Axios 请求中的 Promise", async () => {
    const before = createAxiosInstance((config) => response(config));
    const beforeController = new AbortController();
    beforeController.abort();
    const beforeError = await expectRequestError(
      new PromiseHttpClient({ axiosInstance: before.instance }).get("/before", {
        signal: beforeController.signal,
      }),
    );
    expect(beforeError.error.kind).toBe("cancel");
    expect(before.context.calls).toBe(0);

    const retrying = createAxiosInstance((config, context) => {
      if (context.calls === 1) return Promise.reject(new Error("network down"));
      return response(config);
    });
    const retryController = new AbortController();
    const retryRequest = new PromiseHttpClient({ axiosInstance: retrying.instance }).get(
      "/retry-delay",
      { retryDelay: 1000, signal: retryController.signal },
    );
    await Promise.resolve();
    retryController.abort();
    const retryError = await expectRequestError(retryRequest);
    expect(retryError.error.kind).toBe("cancel");
    expect(retrying.context.calls).toBe(1);

    const pending = createPendingAxiosInstance();
    const requestController = new AbortController();
    const pendingRequest = new PromiseHttpClient({ axiosInstance: pending.instance }).get(
      "/pending",
      { signal: requestController.signal },
    );
    await pending.started;
    requestController.abort();
    const pendingError = await expectRequestError(pendingRequest);
    expect(pendingError.error.kind).toBe("cancel");
    expect(pending.abortCount).toBe(1);
  });

  it("相同请求并发只执行一次，复用成功值和错误实例，完成后重新请求", async () => {
    const success = createAxiosInstance(
      (config) => new Promise((resolve) => setTimeout(() => resolve(response(config)), 5)),
    );
    const client = new PromiseHttpClient({ axiosInstance: success.instance });
    const first = client.get("/dedupe");
    const second = client.get("/dedupe");
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(success.context.calls).toBe(1);
    expect(firstResult).toBe(secondResult);
    await client.get("/dedupe");
    expect(success.context.calls).toBe(2);

    const failure = createAxiosInstance(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("down")), 5)),
    );
    const failureClient = new PromiseHttpClient({ axiosInstance: failure.instance });
    const firstFailure = failureClient.get("/same-error", { retryCount: 1 });
    const secondFailure = failureClient.get("/same-error", { retryCount: 1 });
    const [firstError, secondError] = await Promise.all([
      expectRequestError(firstFailure),
      expectRequestError(secondFailure),
    ]);
    expect(failure.context.calls).toBe(1);
    expect(firstError).toBe(secondError);
  });

  it("请求维度、字段顺序和非稳定数据符合去重边界", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = new PromiseHttpClient({ axiosInstance: instance });

    await Promise.all([
      client.post("/stable", { b: 2, a: 1 }, { params: { z: 3, a: 1 } }),
      client.post("/stable", { a: 1, b: 2 }, { params: { a: 1, z: 3 } }),
    ]);
    expect(context.calls).toBe(1);

    await Promise.all([
      client.post("/unstable", new Map([["a", 1]])),
      client.post("/unstable", new Map([["a", 1]])),
    ]);
    expect(context.calls).toBe(3);

    await Promise.all([
      client.post("/explicit/a", new Map([["a", 1]]), { dedupeKey: "same" }),
      client.post("/explicit/a", new Map([["a", 1]]), { dedupeKey: "same" }),
    ]);
    expect(context.calls).toBe(4);

    await Promise.all([
      client.post("/explicit/a", new Map([["a", 1]]), { dedupeKey: "same" }),
      client.post("/explicit/b", new Map([["a", 1]]), { dedupeKey: "same" }),
    ]);
    expect(context.calls).toBe(6);
  });

  it("带 signal 的请求不去重，两个调用方可以分别取消", async () => {
    const pending = createPendingAxiosInstance();
    const client = new PromiseHttpClient({ axiosInstance: pending.instance });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = client.get("/signal", { signal: firstController.signal });
    const second = client.get("/signal", { signal: secondController.signal });
    await pending.started;
    expect(pending.context.calls).toBe(2);

    firstController.abort();
    const firstError = await expectRequestError(first);
    expect(firstError.error.kind).toBe("cancel");
    secondController.abort();
    const secondError = await expectRequestError(second);
    expect(secondError.error.kind).toBe("cancel");
  });

  it("校验配置、请求参数和 axiosInstance，并保留原始 cause", async () => {
    expect(() => new PromiseHttpClient({ retryCount: 0 })).toThrow("retryCount");
    expect(() => new PromiseHttpClient({ axiosInstance: null as never })).toThrow("axiosInstance");
    expect(() => PromiseHttpClient.create("bad" as never)).toThrow("HttpConfigFactory");

    const { instance } = createAxiosInstance((config) => response(config));
    const client = new PromiseHttpClient({ axiosInstance: instance });
    expect(() => client.get("/invalid", null as never)).toThrow("HttpRequestOptions");
    expect(() => client.request({ url: "/invalid", method: "TRACE" as never })).toThrow("method");
    expect(() => client.get("/invalid", { signal: null as never })).toThrow("signal");

    const cause = new Error("plain failure");
    const failing = createAxiosInstance(() => Promise.reject(cause));
    const error = await expectRequestError(
      new PromiseHttpClient({ axiosInstance: failing.instance }).get("/cause", {
        retryCount: 1,
      }),
    );
    expect(error.cause).toBe(cause);
    expect(error.code).toBe(0);
    expect(error.data).toBeNull();
    expect(error.success).toBe(false);
  });

  it("配置初始化与请求取消解耦，首个请求取消不影响无 signal 的并发请求", async () => {
    let factoryCalls = 0;
    let resolveConfig!: (config: Partial<PromiseHttpClientConfig>) => void;
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = PromiseHttpClient.create(
      () => {
        factoryCalls += 1;
        return new Promise<Partial<PromiseHttpClientConfig>>((resolve) => {
          resolveConfig = resolve;
        });
      },
      { axiosInstance: instance },
    );
    const controller = new AbortController();
    const first = client.get("/cancelled-config", { signal: controller.signal });
    const second = client.get("/shared-config");

    await Promise.resolve();
    controller.abort();
    const error = await expectRequestError(first);
    expect(error.error.kind).toBe("cancel");

    // 工厂 Promise 不属于某个请求；首个请求取消后，其他等待者仍可复用它。
    resolveConfig({ baseUrl: "https://shared.example.test" });
    await second;
    await client.get("/after-shared-config");

    expect(factoryCalls).toBe(1);
    expect(context.configs.map((config) => config.url)).toEqual([
      "https://shared.example.test/shared-config",
      "https://shared.example.test/after-shared-config",
    ]);
  });

  it("配置共享 retry delay 不受单个请求取消影响", async () => {
    let factoryCalls = 0;
    const { instance } = createAxiosInstance((config) => response(config));
    const client = PromiseHttpClient.create(
      () => {
        factoryCalls += 1;
        if (factoryCalls === 1) {
          return Promise.reject(new AxiosError("network down", AxiosError.ERR_NETWORK));
        }
        return { baseUrl: "https://retry.example.test" };
      },
      { axiosInstance: instance, retryCount: 2, retryDelay: 10 },
    );
    const controller = new AbortController();
    const request = client.get("/cancelled-config-delay", { signal: controller.signal });
    const waitingRequest = client.get("/shared-config-delay");

    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    const error = await expectRequestError(request);
    await waitingRequest;

    expect(error.error.kind).toBe("cancel");
    expect(factoryCalls).toBe(2);
  });

  it("无 response 的未知 AxiosError 和普通 Error 不会被误判为可重试网络错误", async () => {
    const badRequest = createAxiosInstance(() =>
      Promise.reject(new AxiosError("bad request", AxiosError.ERR_BAD_REQUEST)),
    );
    const badRequestError = await expectRequestError(
      new PromiseHttpClient({ axiosInstance: badRequest.instance }).get("/bad-code"),
    );
    expect(badRequest.context.calls).toBe(1);
    expect(badRequestError.error.kind).toBe("unknown");

    const typeError = createAxiosInstance(() => Promise.reject(new TypeError("invalid adapter")));
    const typeErrorResult = await expectRequestError(
      new PromiseHttpClient({ axiosInstance: typeError.instance }).get("/type-error"),
    );
    expect(typeError.context.calls).toBe(1);
    expect(typeErrorResult.error.kind).toBe("unknown");
  });

  it("只把明确的 Axios 网络错误、超时、429 和 5xx 纳入重试", async () => {
    const network = createAxiosInstance((config, context) => {
      if (context.calls < 3) {
        return Promise.reject(new AxiosError("network down", AxiosError.ERR_NETWORK, config));
      }
      return response(config);
    });
    await new PromiseHttpClient({ axiosInstance: network.instance }).get("/network");
    expect(network.context.calls).toBe(3);

    const timeout = createAxiosInstance((config, context) => {
      if (context.calls < 2) {
        return Promise.reject(new AxiosError("timeout", AxiosError.ETIMEDOUT, config));
      }
      return response(config);
    });
    await new PromiseHttpClient({ axiosInstance: timeout.instance }).get("/timeout");
    expect(timeout.context.calls).toBe(2);

    for (const status of [429, 503]) {
      const http = createAxiosInstance((config, context) => {
        if (context.calls < 2) return response(config, {}, status);
        return response(config);
      });
      await new PromiseHttpClient({ axiosInstance: http.instance }).get(`/http-${status}`);
      expect(http.context.calls).toBe(2);
    }
  });

  it("只接受具备完整监听接口的 AbortSignal 兼容对象", () => {
    const context = { calls: 0 };
    const { instance } = createAxiosInstance((config) => {
      context.calls += 1;
      return response(config);
    });
    const client = new PromiseHttpClient({ axiosInstance: instance });

    expect(() => client.get("/incomplete-signal", { signal: { aborted: false } as never })).toThrow(
      "signal",
    );
    expect(() =>
      client.get("/invalid-add", {
        signal: {
          aborted: false,
          addEventListener: null,
          removeEventListener: () => undefined,
        } as never,
      }),
    ).toThrow("signal");
    expect(() =>
      client.get("/invalid-remove", {
        signal: {
          aborted: false,
          addEventListener: () => undefined,
          removeEventListener: null,
        } as never,
      }),
    ).toThrow("signal");
    expect(context.calls).toBe(0);
  });

  it("在客户端配置、异步配置和请求级覆盖中限制重试参数上限", async () => {
    const maxTimerDelay = 2_147_483_647;
    const maxRetryCount = 100;
    expect(() => new PromiseHttpClient({ retryCount: maxRetryCount + 1 })).toThrow("retryCount");
    expect(() => new PromiseHttpClient({ retryCount: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      "retryCount",
    );
    expect(() => new PromiseHttpClient({ retryDelay: maxTimerDelay + 1 })).toThrow("retryDelay");
    expect(() => new PromiseHttpClient({ timeout: maxTimerDelay + 1 })).toThrow("timeout");

    const { context, instance } = createAxiosInstance((config) => response(config));
    const asyncConfigClient = PromiseHttpClient.create(
      () => ({ retryCount: maxRetryCount, retryDelay: maxTimerDelay, timeout: maxTimerDelay }),
      { axiosInstance: instance },
    );
    await asyncConfigClient.get("/max-config");
    expect(context.calls).toBe(1);

    const client = new PromiseHttpClient({ axiosInstance: instance });
    await client.get("/max-request", {
      retryCount: maxRetryCount,
      retryDelay: maxTimerDelay,
      timeout: maxTimerDelay,
    });
    expect(context.calls).toBe(2);
    expect(() => client.get("/too-many", { retryCount: maxRetryCount + 1 })).toThrow("retryCount");
    expect(() => client.get("/too-long-delay", { retryDelay: maxTimerDelay + 1 })).toThrow(
      "retryDelay",
    );
    expect(() => client.get("/too-long-timeout", { timeout: maxTimerDelay + 1 })).toThrow(
      "timeout",
    );
  });
});
