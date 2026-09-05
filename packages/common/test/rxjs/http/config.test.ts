import { firstValueFrom, forkJoin, from, of, throwError } from "rxjs";
import { describe, expect, it } from "vitest";
import { type HttpClientConfig, RxHttpClient } from "../../../src/rxjs/http.js";
import { createAxiosInstance, response } from "../../helpers/http/adapter.js";
import { requestError } from "../../helpers/http/assertions.js";
import { deferred } from "../../helpers/http/deferred.js";

describe("rxjs/http 配置", () => {
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
    const config = deferred<Partial<HttpClientConfig>>();
    const { instance } = createAxiosInstance((config) => Promise.resolve(response(config)));
    const client = RxHttpClient.create(
      () => {
        factoryCalls += 1;
        // 两个订阅者都进入初始化后，测试显式提交配置。
        return from(config.promise);
      },
      { axiosInstance: instance },
    );

    const requests = firstValueFrom(forkJoin([client.get("/one"), client.get("/two")]));
    expect(factoryCalls).toBe(1);
    config.resolve({ retryCount: 1 });
    await requests;

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

  it("保留 RxJS 数值上限与简化 signal 的既有兼容范围", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = new RxHttpClient({
      axiosInstance: instance,
      retryCount: 101,
      retryDelay: 2_147_483_648,
      timeout: 2_147_483_648,
    });
    await firstValueFrom(client.get("/legacy-limits", { signal: { aborted: false } }));
    expect(context.calls).toBe(1);
    expect(context.configs[0]?.timeout).toBe(2_147_483_648);
  });
});
