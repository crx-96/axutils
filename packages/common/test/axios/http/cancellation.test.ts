import { AxiosError } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromiseHttpClient, type PromiseHttpClientConfig } from "../../../src/axios/http.js";
import {
  createAxiosInstance,
  createPendingAxiosInstance,
  response,
} from "../../helpers/http/adapter.js";
import { expectRequestError } from "../../helpers/http/assertions.js";
import { deferred } from "../../helpers/http/deferred.js";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("axios/http 取消生命周期", () => {
  it("AbortSignal 可以取消调用前、retry delay 和 Axios 请求中的 Promise", async () => {
    vi.useFakeTimers();
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
      if (context.calls === 1)
        return Promise.reject(new AxiosError("network down", AxiosError.ERR_NETWORK, config));
      return response(config);
    });
    const retryController = new AbortController();
    const retryRequest = new PromiseHttpClient({ axiosInstance: retrying.instance }).get(
      "/retry-delay",
      { retryDelay: 1000, signal: retryController.signal },
    );
    const retryErrorPromise = expectRequestError(retryRequest);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    retryController.abort();
    const retryError = await retryErrorPromise;
    await vi.advanceTimersByTimeAsync(1000);
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

  it("配置初始化与请求取消解耦，首个请求取消不影响无 signal 的并发请求", async () => {
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
    const controller = new AbortController();
    const first = client.get("/cancelled-config", { signal: controller.signal });
    const second = client.get("/shared-config");

    await Promise.resolve();
    controller.abort();
    const error = await expectRequestError(first);
    expect(error.error.kind).toBe("cancel");

    // 工厂 Promise 不属于某个请求；首个请求取消后，其他等待者仍可复用它。
    config.resolve({ baseUrl: "https://shared.example.test" });
    await second;
    await client.get("/after-shared-config");

    expect(factoryCalls).toBe(1);
    expect(context.configs.map((config) => config.url)).toEqual([
      "https://shared.example.test/shared-config",
      "https://shared.example.test/after-shared-config",
    ]);
  });

  it("配置共享 retry delay 不受单个请求取消影响", async () => {
    vi.useFakeTimers();
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

    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    const error = await expectRequestError(request);
    await vi.advanceTimersByTimeAsync(10);
    await waitingRequest;

    expect(error.error.kind).toBe("cancel");
    expect(factoryCalls).toBe(2);
  });
});
