import { AxiosError } from "axios";
import {
  EMPTY,
  Observable,
  Subject,
  finalize,
  firstValueFrom,
  lastValueFrom,
  map,
  of,
  throwError,
  toArray,
} from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { type HttpSuccess, RxHttpClient } from "../../../src/rxjs/http.js";
import { createAxiosInstance, response } from "../../helpers/http/adapter.js";
import { deferred } from "../../helpers/http/deferred.js";

describe("rxjs/http Observable 响应转换", () => {
  it.each([false, true])("展开处理函数的流并保留所有发值（create=%s）", async (useFactory) => {
    const { instance } = createAxiosInstance((config) => response(config, { name: "Ada" }));
    const options = {
      axiosInstance: instance,
      transformResponse: (result: HttpSuccess<{ name: string }>) =>
        of(result.data.name, "Grace").pipe(map((name) => ({ name }))),
    };
    const client = useFactory
      ? RxHttpClient.create(() => of({}), options)
      : new RxHttpClient(options);

    await expect(lastValueFrom(client.get("/users").pipe(toArray()))).resolves.toEqual([
      { name: "Ada" },
      { name: "Grace" },
    ]);
  });

  it("空转换流直接完成，Promise 返回的流也会展开", async () => {
    const { instance } = createAxiosInstance((config) => response(config));
    const empty = new RxHttpClient({ axiosInstance: instance, transformResponse: () => EMPTY });
    await expect(lastValueFrom(empty.get("/empty").pipe(toArray()))).resolves.toEqual([]);

    const promised = new RxHttpClient({
      axiosInstance: instance,
      transformResponse: async () => of(1, 2),
    });
    await expect(lastValueFrom(promised.get("/promised").pipe(toArray()))).resolves.toEqual([1, 2]);
  });

  it("普通数组保留为单个返回值，Observable 内的值不再次展开", async () => {
    const { instance } = createAxiosInstance((config) => response(config));
    const array = new RxHttpClient({ axiosInstance: instance, transformResponse: () => [1, 2] });
    await expect(lastValueFrom(array.get("/array").pipe(toArray()))).resolves.toEqual([[1, 2]]);

    const value = of(7);
    const nested = new RxHttpClient({
      axiosInstance: instance,
      transformResponse: () => of(value),
    });
    const values = await lastValueFrom(nested.get("/nested").pipe(toArray()));
    expect(values).toEqual([value]);
  });

  it("转换流的错误走统一错误通道，不重新执行网络请求", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const cause = new AxiosError("业务处理失败", AxiosError.ERR_NETWORK);
    const finalized = vi.fn();
    const client = new RxHttpClient({
      axiosInstance: instance,
      transformResponse: () => throwError(() => cause).pipe(finalize(finalized)),
    });

    await expect(firstValueFrom(client.get("/error"))).rejects.toMatchObject({
      error: { cause, kind: "network" },
    });
    expect(context.calls).toBe(1);
    expect(finalized).toHaveBeenCalledOnce();
  });

  it("转换流已发值后，AbortSignal 仍能终止后续发值并释放订阅", async () => {
    const { instance } = createAxiosInstance((config) => response(config));
    const controller = new AbortController();
    const firstEmission = deferred();
    const finalized = vi.fn();
    const values: string[] = [];
    const source = new Subject<string>();
    const client = new RxHttpClient({
      axiosInstance: instance,
      transformResponse: () =>
        new Observable<string>((subscriber) => {
          subscriber.next("first");
          firstEmission.resolve();
          return source.subscribe(subscriber);
        }).pipe(finalize(finalized)),
    });
    const finished = deferred<unknown>();
    client.get("/stream", { signal: controller.signal }).subscribe({
      error: finished.resolve,
      next: (value) => values.push(value),
    });

    await firstEmission.promise;
    controller.abort();
    expect(await finished.promise).toMatchObject({ error: { kind: "cancel" } });
    source.next("too late");
    expect(values).toEqual(["first"]);
    expect(finalized).toHaveBeenCalledOnce();
    source.complete();
  });

  it("共享 HTTP 请求时各自订阅转换流，一个调用方退订不影响另一个", async () => {
    const release = deferred();
    const bothSubscribed = deferred();
    const source = new Subject<number>();
    const finalized = vi.fn();
    const { context, instance, started } = createAxiosInstance(async (config) => {
      await release.promise;
      return response(config);
    });
    let subscribers = 0;
    const client = new RxHttpClient({
      axiosInstance: instance,
      transformResponse: () =>
        new Observable<number>((subscriber) => {
          subscribers += 1;
          if (subscribers === 2) bothSubscribed.resolve();
          return source.subscribe(subscriber);
        }).pipe(finalize(finalized)),
    });
    const firstValues: number[] = [];
    const first = client.get("/shared").subscribe((value) => firstValues.push(value));
    const second = lastValueFrom(client.get("/shared").pipe(toArray()));
    await started;
    release.resolve();
    await bothSubscribed.promise;

    source.next(1);
    first.unsubscribe();
    expect(finalized).toHaveBeenCalledTimes(1);
    source.next(2);
    source.complete();
    expect(firstValues).toEqual([1]);
    await expect(second).resolves.toEqual([1, 2]);
    expect(finalized).toHaveBeenCalledTimes(2);
    expect(context.calls).toBe(1);
  });
});
