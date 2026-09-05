import { firstValueFrom, forkJoin } from "rxjs";
import { describe, expect, it } from "vitest";
import { HttpRequestError, RxHttpClient } from "../../../src/rxjs/http.js";
import { createAxiosInstance, response } from "../../helpers/http/adapter.js";
import { deferred } from "../../helpers/http/deferred.js";

describe("rxjs/http 并发去重", () => {
  it("相同请求只执行一次，字段顺序不同仍可去重且共享同一个结果对象", async () => {
    const gate = deferred();
    const { context, instance } = createAxiosInstance((config) =>
      gate.promise.then(() => response(config, { shared: true })),
    );
    const client = new RxHttpClient({ axiosInstance: instance });
    const first = client.post(
      "/dedupe",
      // biome-ignore assist/source/useSortedKeys: 故意保留非排序输入，验证键顺序处理且不弱化回归覆盖。
      { b: 2, a: 1 },
      // biome-ignore assist/source/useSortedKeys: 故意保留非排序输入，验证键顺序处理且不弱化回归覆盖。
      { params: { z: 3, a: 1 }, headers: { "x-b": "2", "x-a": "1" }, retryCount: 1 },
    );
    const second = client.post(
      "/dedupe",
      { a: 1, b: 2 },
      { headers: { "x-a": "1", "x-b": "2" }, params: { a: 1, z: 3 }, retryCount: 1 },
    );

    const requests = firstValueFrom(forkJoin([first, second]));
    gate.resolve();
    const [firstResult, secondResult] = await requests;

    expect(context.calls).toBe(1);
    expect(firstResult).toBe(secondResult);
  });

  it("默认不取消底层请求时，最后一个订阅者离开后仍复用未完成请求", async () => {
    const requestReleased = deferred();
    const { context, instance } = createAxiosInstance((config) =>
      requestReleased.promise.then(() => response(config, { shared: true })),
    );
    const client = new RxHttpClient({ axiosInstance: instance });
    const firstSubscription = client.get("/keep-deduped", { retryCount: 1 }).subscribe();

    expect(context.calls).toBe(1);
    firstSubscription.unsubscribe();

    const secondResult = firstValueFrom(client.get("/keep-deduped", { retryCount: 1 }));
    expect(context.calls).toBe(1);
    requestReleased.resolve();

    await expect(secondResult).resolves.toMatchObject({ data: { shared: true }, success: true });
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
    const gate = deferred();
    const { instance } = createAxiosInstance(() =>
      gate.promise.then(() => {
        throw new Error("network down");
      }),
    );
    const client = new RxHttpClient({ axiosInstance: instance });
    const stream = client.get("/same-error", { retryCount: 1 });
    let firstError: unknown;
    let secondError: unknown;

    const completed = new Promise<void>((resolve) => {
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

    gate.resolve();
    await completed;
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
        withKeyClient.post("/map", new Map([["a", 1]]), { dedupeKey: "map-a", retryCount: 1 }),
        withKeyClient.post("/map", new Map([["a", 1]]), { dedupeKey: "map-a", retryCount: 1 }),
      ]),
    );
    expect(withKey.context.calls).toBe(1);

    const gate = deferred();
    const sameKeyDifferentUrl = createAxiosInstance((config) =>
      gate.promise.then(() => response(config)),
    );
    const sameKeyClient = new RxHttpClient({ axiosInstance: sameKeyDifferentUrl.instance });
    const requests = firstValueFrom(
      forkJoin([
        sameKeyClient.post("/upload/a", new Map([["a", 1]]), {
          dedupeKey: "same-upload",
          retryCount: 1,
        }),
        sameKeyClient.post("/upload/b", new Map([["a", 1]]), {
          dedupeKey: "same-upload",
          retryCount: 1,
        }),
      ]),
    );
    gate.resolve();
    await requests;
    expect(sameKeyDifferentUrl.context.calls).toBe(2);
  });
});
