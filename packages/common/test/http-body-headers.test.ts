import { PassThrough, Readable, Stream } from "node:stream";
import { text } from "node:stream/consumers";
import { AxiosError, AxiosHeaders } from "axios";
import { type Observable, firstValueFrom, isObservable } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
  PromiseHttpClient,
  type PromiseHttpClientOptions,
  PromiseHttpRequestError,
} from "../src/axios/http.js";
import { canReplayRequestBody } from "../src/internal/http/primitives.js";
import { HttpRequestError, RxHttpClient } from "../src/rxjs/http.js";
import { createAxiosInstance, response } from "./helpers/http/adapter.js";

function resultOf<T>(request: Promise<T> | Observable<T>): Promise<T> {
  return isObservable(request) ? firstValueFrom(request) : request;
}

describe.each(["Promise", "RxJS"])("%s HTTP 请求体重试与请求头快照", (kind) => {
  function client(options: PromiseHttpClientOptions) {
    return kind === "Promise" ? new PromiseHttpClient(options) : new RxHttpClient(options);
  }

  it.each([false, true])(
    "multipart 文件流只消费一次并保留首个 503 cause（嵌套数组=%s）",
    async (nested) => {
      let failure: AxiosError | undefined;
      let received: string | undefined;
      const { context, instance } = createAxiosInstance(async (config, attempt) => {
        if (attempt.calls > 1) return response(config);
        if (!(config.data instanceof Stream)) throw new Error("预期 Axios 生成 multipart 流");
        received = await text(config.data.pipe(new PassThrough()));
        failure = new AxiosError(
          "upload failed",
          AxiosError.ERR_BAD_RESPONSE,
          config,
          undefined,
          response(config, null, 503),
        );
        throw failure;
      });
      const http = client({
        axiosInstance: instance,
        retryCount: 2,
        retryDelay: 0,
        retryNonIdempotent: true,
      });
      const file = Readable.from(["file contents"], { objectMode: false });
      const body = nested ? { uploads: [{ file }] } : { file };
      const request = resultOf(
        http.put("/upload", body, { headers: { "Content-Type": "multipart/form-data" } }),
      );

      const rejection: unknown = await request.catch((error: unknown) => error);
      if (
        !(rejection instanceof PromiseHttpRequestError || rejection instanceof HttpRequestError)
      ) {
        throw new Error("预期客户端传播首次传输错误");
      }
      expect(rejection).toMatchObject({ code: 503, error: { kind: "http" } });
      expect(rejection.error.cause).toBe(failure);
      expect(received).toContain("file contents");
      expect(context.calls).toBe(1);
    },
  );

  it("普通 JSON 中与流方法同名的数据可原样重发", async () => {
    const { context, instance } = createAxiosInstance((config, attempt) =>
      response(config, null, attempt.calls === 1 ? 503 : 200),
    );
    const http = client({
      axiosInstance: instance,
      retryCount: 2,
      retryDelay: 0,
      retryNonIdempotent: true,
    });
    const body = { getReader: false, on: "value", pipe: null };
    await expect(resultOf(http.put("/json", body))).resolves.toMatchObject({ code: 200 });
    expect(context.configs.map((config) => config.data)).toEqual([
      JSON.stringify(body),
      JSON.stringify(body),
    ]);
  });

  it("继承的 common 和方法分组 getter 各读一次，扁平头最后覆盖", async () => {
    const common = vi.fn(() =>
      Object.assign(Object.create(null), {
        "X-Common": "common",
        "X-Direct": "common",
        "X-Method": "common",
      }),
    );
    const method = vi.fn(() => new AxiosHeaders({ "x-direct": "method", "x-method": "method" }));
    const direct = vi.fn(() => "flat");
    const headers = Object.create(
      {
        get common() {
          return common();
        },
        get get() {
          return method();
        },
        get post() {
          throw new Error("非当前方法的继承组不应读取");
        },
      },
      { "X-Direct": { enumerable: true, get: direct } },
    );
    const { context, instance } = createAxiosInstance((config) => response(config));
    const http = client({ axiosInstance: instance });
    await resultOf(http.get("/headers", { headers }));

    const sent = context.configs[0]?.headers;
    expect(sent?.get("X-Common")).toBe("common");
    expect(sent?.get("X-Method")).toBe("method");
    expect(sent?.get("X-Direct")).toBe("flat");
    expect(common).toHaveBeenCalledOnce();
    expect(method).toHaveBeenCalledOnce();
    expect(direct).toHaveBeenCalledOnce();
  });

  it("继承的默认组参与合并，请求组 getter 首次返回 undefined 可屏蔽默认组", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const common = vi.fn(() => ({ Authorization: "default-token" }));
    const method = vi.fn(() => ({ "X-Method": "default" }));
    instance.defaults.headers = Object.create({
      get common() {
        return common();
      },
      get get() {
        return method();
      },
    });
    const suppress = vi.fn().mockReturnValueOnce(undefined).mockReturnValue({});
    const headers = Object.create({
      get common() {
        return suppress();
      },
    });
    const http = client({ axiosInstance: instance });
    await resultOf(http.get("/defaults"));
    await resultOf(http.get("/suppressed", { headers }));

    expect(context.configs[0]?.headers.get("Authorization")).toBe("default-token");
    expect(context.configs[1]?.headers.get("Authorization")).toBeUndefined();
    for (const config of context.configs) expect(config.headers.get("X-Method")).toBe("default");
    expect(suppress).toHaveBeenCalledOnce();
    expect(method).toHaveBeenCalledTimes(2);
  });

  it("展开 Common/GET/POST 等大小写分组并合并同类变体，同时保留屏蔽语义", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    instance.defaults.headers.common.Authorization = "default-token";
    const http = client({ axiosInstance: instance });

    const commonLower = { "X-Lower": "lower", "X-Shared": "lower" };
    const commonUpper = { "X-Shared": "upper", "X-Upper": "upper" };
    await resultOf(
      http.get("/mixed-case", {
        headers: {
          Common: commonUpper,
          common: commonLower,
          GET: { "X-Get": "from-get" },
          POST: { "X-Post": "from-post" },
        } as never,
      }),
    );

    const getSent = context.configs[0]?.headers;
    expect(getSent?.get("X-Lower")).toBe("lower");
    expect(getSent?.get("X-Upper")).toBe("upper");
    expect(getSent?.get("X-Shared")).toBe("lower");
    expect(getSent?.get("X-Get")).toBe("from-get");
    expect(getSent?.get("X-Post")).toBeUndefined();
    expect(getSent?.get("Authorization")).toBe("default-token");
    expect(commonLower).toEqual({ "X-Lower": "lower", "X-Shared": "lower" });
    expect(commonUpper).toEqual({ "X-Shared": "upper", "X-Upper": "upper" });

    await resultOf(
      http.post("/post-case", undefined, {
        headers: {
          Common: false,
          GET: { "X-Get": "from-get" },
          POST: { "X-Post": "from-post" },
        } as never,
      }),
    );

    const postSent = context.configs[1]?.headers;
    expect(postSent?.get("Authorization")).toBeUndefined();
    expect(postSent?.get("X-Post")).toBe("from-post");
    expect(postSent?.get("X-Get")).toBeUndefined();
  });

  it("非对象分组值（如字符串）不会污染请求头产生数字索引字段", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    instance.defaults.headers.common["X-Default"] = "keep";
    const http = client({ axiosInstance: instance });

    await resultOf(
      http.get("/primitive-group", {
        headers: { common: "abc", "X-Flat": "ok" } as never,
      }),
    );

    const sent = context.configs[0]?.headers;
    expect(sent?.get("X-Flat")).toBe("ok");
    expect(sent?.get("X-Default")).toBe("keep");
    expect(sent?.get("0")).toBeUndefined();
    expect(sent?.get("1")).toBeUndefined();
    expect(sent?.get("2")).toBeUndefined();
  });
});

it("仅检查可枚举数据及协议描述符，遇到可能产生流的 getter 时保留传输失败", () => {
  const get = vi.fn(() => {
    throw new Error("重试判定不能读取 getter");
  });
  const member = Object.create({
    get getReader() {
      return get();
    },
  });
  expect(canReplayRequestBody(member)).toBe(false);
  expect(
    canReplayRequestBody({ files: [Object.defineProperty({}, "file", { enumerable: true, get })] }),
  ).toBe(false);
  expect(canReplayRequestBody(Object.defineProperty({}, "metadata", { get }))).toBe(true);
  expect(get).not.toHaveBeenCalled();
});

it("循环与共享引用只访问一次，继续检查同级流及迭代器", () => {
  const parts: unknown[] = [];
  const body = { also: parts, parts };
  parts.push(body);
  expect(canReplayRequestBody(body)).toBe(true);
  for (const source of [
    new ReadableStream(),
    [1].values(),
    (async function* () {
      yield 1;
    })(),
  ]) {
    parts.push(source);
    expect(canReplayRequestBody(body)).toBe(false);
    parts.pop();
  }
});
