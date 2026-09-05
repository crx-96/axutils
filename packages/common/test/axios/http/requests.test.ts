import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import { PromiseHttpClient } from "../../../src/axios/http.js";
import { createAxiosInstance, response } from "../../helpers/http/adapter.js";
import { expectRequestError } from "../../helpers/http/assertions.js";

describe("axios/http 请求、错误与重试", () => {
  it("立即执行请求并统一返回 HTTP 成功结果", async () => {
    const { context, instance, started } = createAxiosInstance((config) =>
      response(config, { code: "业务字段不会覆盖 HTTP 状态" }, 201),
    );
    const client = new PromiseHttpClient({ axiosInstance: instance });

    const request = client.get("/users");
    await started;
    expect(context.calls).toBe(1);
    const result = await request;

    expect(context.configs[0]?.url).toBe("/users");
    expect(result).toEqual({
      code: 201,
      data: { code: "业务字段不会覆盖 HTTP 状态" },
      error: null,
      success: true,
    });
  });

  it("拼接 baseUrl，并传递 params、headers、data 和 timeout", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = new PromiseHttpClient({
      axiosInstance: instance,
      baseUrl: "https://api.example.test/v1/",
    });

    await client.post(
      "/users",
      { name: "Ada" },
      { headers: { "x-test": "yes" }, params: { page: 1 }, timeout: 1000 },
    );
    await client.get("https://other.example.test/absolute");

    expect(context.configs[0]).toMatchObject({
      data: JSON.stringify({ name: "Ada" }),
      headers: { "x-test": "yes" },
      params: { page: 1 },
      timeout: 1000,
      url: "https://api.example.test/v1/users",
    });
    expect(context.configs[1]?.url).toBe("https://other.example.test/absolute");
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

  it.each([600, 700])("非标准 HTTP %i 状态不按 5xx 重试", async (status) => {
    const { context, instance } = createAxiosInstance((config) => response(config, {}, status));
    const error = await expectRequestError(
      new PromiseHttpClient({ axiosInstance: instance }).get("/nonstandard"),
    );
    expect(context.calls).toBe(1);
    expect(error.code).toBe(status);
    expect(error.error.kind).toBe("http");
  });
});
