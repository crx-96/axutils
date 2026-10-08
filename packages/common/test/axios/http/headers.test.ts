import { AxiosError } from "axios";
import { describe, expect, it, vi } from "vitest";
import { PromiseHttpClient } from "../../../src/axios/http.js";
import { createAxiosInstance, response } from "../../helpers/http/adapter.js";
import { deferred } from "../../helpers/http/deferred.js";

describe("axios/http 默认请求头与传输身份", () => {
  it.each([
    "common",
    "get",
    "direct",
  ] as const)("%s 默认鉴权头变化后，同一 URL 的并发请求不共享旧账号响应", async (group) => {
    const release = deferred();
    const { context, instance, started } = createAxiosInstance(async (config) => {
      await release.promise;
      return response(config, config.headers.get("Authorization"));
    });
    const setToken = (token: string) => {
      if (group === "direct") instance.defaults.headers.Authorization = token;
      else instance.defaults.headers[group].Authorization = token;
    };
    setToken("first-account");
    const client = new PromiseHttpClient({ axiosInstance: instance });
    const first = client.get("/profile");
    await started;
    setToken("second-account");
    const second = client.get("/profile");
    await Promise.resolve();
    release.resolve();

    const results = await Promise.all([first, second]);
    expect(context.calls).toBe(2);
    expect(results.map((result) => result.data)).toEqual(["first-account", "second-account"]);
  });

  it.each([
    "common",
    "get",
  ] as const)("请求级和回调字段都可以覆盖 %s 默认头中的 false", async (group) => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    instance.defaults.headers[group].Authorization = false;
    const plain = new PromiseHttpClient({ axiosInstance: instance });
    const transformed = new PromiseHttpClient({
      axiosInstance: instance,
      transformHeaders: () => ({ Authorization: "callback-token" }),
    });

    await plain.get("/request", { headers: { authorization: "request-token" } });
    await transformed.get("/callback");
    await transformed.get("/both", { headers: { authorization: "explicit-token" } });

    expect(context.configs.map((config) => config.headers.get("Authorization"))).toEqual([
      "request-token",
      "callback-token",
      "explicit-token",
    ]);
    expect(instance.defaults.headers[group].Authorization).toBe(false);
  });

  it("网络重试复用已解析的默认头，不加入期间新建的默认字段", async () => {
    const { context, instance } = createAxiosInstance((config, current) => {
      if (current.calls === 1) {
        instance.defaults.headers.common.Authorization = "changed";
        instance.defaults.headers.common["X-New-Common"] = "new";
        instance.defaults.headers.get["X-New-Method"] = "new";
        instance.defaults.headers["X-New-Direct"] = "new";
        throw new AxiosError("network down", AxiosError.ERR_NETWORK, config);
      }
      return response(config);
    });
    instance.defaults.headers.common.Authorization = "original";
    const transformHeaders = vi.fn(() => ({ "X-Transform": "once" }));
    const client = new PromiseHttpClient({ axiosInstance: instance, transformHeaders });

    await client.get("/retry");

    expect(context.calls).toBe(2);
    expect(transformHeaders).toHaveBeenCalledOnce();
    for (const config of context.configs) {
      expect(config.headers.get("Authorization")).toBe("original");
      expect(config.headers.get("X-Transform")).toBe("once");
      expect(config.headers.get("X-New-Common")).toBeUndefined();
      expect(config.headers.get("X-New-Method")).toBeUndefined();
      expect(config.headers.get("X-New-Direct")).toBeUndefined();
    }
  });
});
