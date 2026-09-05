import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { RxHttpClient } from "../../../src/rxjs/http.js";
import { createAxiosInstance, response } from "../../helpers/http/adapter.js";
import { requestError } from "../../helpers/http/assertions.js";

describe("rxjs/http 请求、错误与重试", () => {
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
      data: { code: "业务字段不会覆盖 HTTP 状态" },
      error: null,
      success: true,
    });
  });

  it("拼接自定义 baseUrl，但绝对 URL 保持不变", async () => {
    const { context, instance } = createAxiosInstance((config) =>
      Promise.resolve(response(config)),
    );
    const client = new RxHttpClient({
      axiosInstance: instance,
      baseUrl: "https://api.example.test/v1/",
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
        code: 0,
        kind: "network",
        makeError: (config) => new AxiosError("network error", AxiosError.ERR_NETWORK, config),
      },
      {
        code: 0,
        kind: "timeout",
        makeError: (config) => new AxiosError("timeout", AxiosError.ETIMEDOUT, config),
      },
      {
        code: 0,
        kind: "cancel",
        makeError: (config) => new AxiosError("canceled", AxiosError.ERR_CANCELED, config),
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

  it("不会修改调用方传入的 params、data 和 headers", async () => {
    const { instance } = createAxiosInstance((config) => Promise.resolve(response(config)));
    const client = new RxHttpClient({ axiosInstance: instance });
    // biome-ignore assist/source/useSortedKeys: 故意保留非排序输入，验证键顺序处理且不弱化回归覆盖。
    const params = { b: 2, a: 1 };
    const data = { nested: { value: 1 } };
    const headers = { "x-test": "value" };
    const before = JSON.stringify({ data, headers, params });

    await firstValueFrom(client.post("/immutable-input", data, { headers, params }));

    expect(JSON.stringify({ data, headers, params })).toBe(before);
  });

  it("未知 AxiosError 保留网络分类、三次尝试和嵌套 cause", async () => {
    const cause = new AxiosError("unknown adapter error", AxiosError.ERR_BAD_REQUEST);
    const { context, instance } = createAxiosInstance(() => Promise.reject(cause));
    const error = await requestError(
      new RxHttpClient({ axiosInstance: instance }).get("/legacy-error"),
    );
    expect(context.calls).toBe(3);
    expect(error.error.kind).toBe("network");
    expect(error.error.cause).toBe(cause);
    expect("cause" in error).toBe(false);
  });

  it("非标准 HTTP 600 状态保留 RxJS 的重试范围", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config, {}, 600));
    const error = await requestError(
      new RxHttpClient({ axiosInstance: instance }).get("/nonstandard"),
    );
    expect(context.calls).toBe(3);
    expect(error.code).toBe(600);
    expect(error.error.kind).toBe("http");
  });
});
