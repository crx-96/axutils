import { describe, expect, it } from "vitest";
import { PromiseHttpClient, type PromiseHttpClientConfig } from "../../../src/axios/http.js";
import { createAxiosInstance, response } from "../../helpers/http/adapter.js";
import { expectRequestError } from "../../helpers/http/assertions.js";
import { deferred } from "../../helpers/http/deferred.js";

describe("axios/http 配置", () => {
  it("异步配置在首次请求时执行、成功缓存，并发请求共享一次初始化", async () => {
    let factoryCalls = 0;
    const config = deferred<Partial<PromiseHttpClientConfig>>();
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = PromiseHttpClient.create(
      () => {
        factoryCalls += 1;
        return config.promise;
      },
      { axiosInstance: instance },
    );

    const first = client.get("/first");
    const second = client.get("/second");
    expect(factoryCalls).toBe(1);
    expect(context.calls).toBe(0);

    config.resolve({ baseUrl: "https://api.example.test" });
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

  it("校验配置、请求参数和 axiosInstance，并保留原始 cause", async () => {
    expect(() => new PromiseHttpClient({ retryCount: 0 })).toThrow("retryCount");
    expect(() => new PromiseHttpClient({ axiosInstance: null as never })).toThrow("axiosInstance");
    expect(() => PromiseHttpClient.create("bad" as never)).toThrow("HttpConfigFactory");

    const { instance } = createAxiosInstance((config) => response(config));
    const client = new PromiseHttpClient({ axiosInstance: instance });
    expect(() => client.get("/invalid", null as never)).toThrow("HttpRequestOptions");
    expect(() => client.request({ method: "TRACE" as never, url: "/invalid" })).toThrow("method");
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
