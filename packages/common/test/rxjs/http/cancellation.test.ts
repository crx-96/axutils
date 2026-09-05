import { AxiosError } from "axios";
import { firstValueFrom, map, timer } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpRequestError, RxHttpClient } from "../../../src/rxjs/http.js";
import {
  createAxiosInstance,
  createPendingAxiosInstance,
  response,
} from "../../helpers/http/adapter.js";
import { requestError } from "../../helpers/http/assertions.js";
import { deferred } from "../../helpers/http/deferred.js";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("rxjs/http 取消生命周期", () => {
  it("AbortSignal 在重试等待期间会立即结束请求且不会发起下一次尝试", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const firstAttempt = deferred();
    const retryable = createAxiosInstance((config, context) => {
      if (context.calls === 1) {
        firstAttempt.resolve();
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

    await firstAttempt.promise;
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();

    const resultPromise = Promise.race([
      errorPromise.then((error) => ({ error, timely: true })),
      firstValueFrom(timer(50)).then(() => ({ error: undefined, timely: false })),
    ]);
    await vi.advanceTimersByTimeAsync(50);
    const result = await resultPromise;
    if (!result.timely) {
      // 失败实现会在 retryDelay 到期后才结束，等待它收尾以避免测试留下后台订阅。
      await vi.runAllTimersAsync();
      await errorPromise;
    }

    expect(result.timely).toBe(true);
    expect(result.error?.error.kind).toBe("cancel");
    expect(retryable.context.calls).toBe(1);
  });

  it("AbortSignal 在异步配置尚未完成时会立即结束请求", async () => {
    vi.useFakeTimers();
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

    await vi.advanceTimersByTimeAsync(10);
    controller.abort();

    const resultPromise = Promise.race([
      errorPromise.then((error) => ({ error, timely: true })),
      firstValueFrom(timer(50)).then(() => ({ error: undefined, timely: false })),
    ]);
    await vi.advanceTimersByTimeAsync(50);
    const result = await resultPromise;
    if (!result.timely) {
      // 失败实现会等配置流结束后才发现 signal 已取消，等待它收尾以避免测试留下后台订阅。
      await vi.runAllTimersAsync();
      await errorPromise;
    }

    expect(result.timely).toBe(true);
    expect(result.error?.error.kind).toBe("cancel");
    expect(context.calls).toBe(0);
  });

  it("开启 cancelOnNoSubscribers 后，只有最后一个订阅者取消才会中止共享请求", async () => {
    const pending = createPendingAxiosInstance();
    const { context, instance, started } = pending;
    const client = new RxHttpClient({ axiosInstance: instance });
    const options = { cancelOnNoSubscribers: true, retryCount: 1 };
    const firstSubscription = client.get("/cancel-on-last", options).subscribe({
      error: () => undefined,
    });
    const secondSubscription = client.get("/cancel-on-last", options).subscribe({
      error: () => undefined,
    });

    try {
      await started;
      firstSubscription.unsubscribe();
      expect(pending.abortCount).toBe(0);

      secondSubscription.unsubscribe();
      expect(pending.abortCount).toBe(1);
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
      .get("/cancel-single", { dedupe: false, retryCount: 1 })
      .subscribe({ error: () => undefined });

    await pending.started;
    subscription.unsubscribe();

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

    expect(pending.abortCount).toBe(0);
    expect(pending.context.calls).toBe(1);
    pending.complete();
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
    const gate = deferred();
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
          void gate.promise.then(() => resolve(response(config)));
        }),
    );

    const request = firstValueFrom(
      new RxHttpClient({ axiosInstance: instance }).get("/completed", {
        cancelOnNoSubscribers: true,
        retryCount: 1,
      }),
    );

    gate.resolve();
    await request;
    expect(abortCount).toBe(0);
  });

  it("开启自动取消时仍会响应调用方传入的 AbortSignal", async () => {
    const pending = createPendingAxiosInstance();
    const controller = new AbortController();
    const errorPromise = requestError(
      new RxHttpClient({ axiosInstance: pending.instance }).get("/caller-signal", {
        cancelOnNoSubscribers: true,
        retryCount: 1,
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
    vi.useFakeTimers();
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
      await vi.advanceTimersByTimeAsync(0);
      expect(pending.context.calls).toBe(2);

      secondController.abort();
      const secondErrorResult = Promise.race([
        secondErrorPromise,
        firstValueFrom(timer(50)).then(() => undefined),
      ]);
      await vi.advanceTimersByTimeAsync(50);
      const secondError = await secondErrorResult;
      expect(secondError).toBeInstanceOf(HttpRequestError);
      expect(secondError?.error.kind).toBe("cancel");
    } finally {
      firstController.abort();
      secondController.abort();
      await Promise.all([firstErrorPromise, secondErrorPromise]);
    }
  });
});
