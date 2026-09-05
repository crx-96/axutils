import { describe, expect, it } from "vitest";
import { PromiseHttpClient } from "../../../src/axios/http.js";
import { createAxiosInstance, response } from "../../helpers/http/adapter.js";
import { expectRequestError } from "../../helpers/http/assertions.js";
import { deferred } from "../../helpers/http/deferred.js";

describe("axios/http 并发去重", () => {
  it("相同请求并发只执行一次，复用成功值和错误实例，完成后重新请求", async () => {
    const successGate = deferred();
    const success = createAxiosInstance((config) =>
      successGate.promise.then(() => response(config)),
    );
    const client = new PromiseHttpClient({ axiosInstance: success.instance });
    const first = client.get("/dedupe");
    const second = client.get("/dedupe");
    await success.started;
    successGate.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(success.context.calls).toBe(1);
    expect(firstResult).toBe(secondResult);
    await client.get("/dedupe");
    expect(success.context.calls).toBe(2);

    const failureGate = deferred();
    const failure = createAxiosInstance(() =>
      failureGate.promise.then(() => {
        throw new Error("down");
      }),
    );
    const failureClient = new PromiseHttpClient({ axiosInstance: failure.instance });
    const firstFailure = failureClient.get("/same-error", { retryCount: 1 });
    const secondFailure = failureClient.get("/same-error", { retryCount: 1 });
    const errors = Promise.all([
      expectRequestError(firstFailure),
      expectRequestError(secondFailure),
    ]);
    await failure.started;
    failureGate.resolve();
    const [firstError, secondError] = await errors;
    expect(failure.context.calls).toBe(1);
    expect(firstError).toBe(secondError);
  });

  it("请求维度、字段顺序和非稳定数据符合去重边界", async () => {
    const { context, instance } = createAxiosInstance((config) => response(config));
    const client = new PromiseHttpClient({ axiosInstance: instance });

    await Promise.all([
      // biome-ignore assist/source/useSortedKeys: 故意保留非排序输入，验证键顺序处理且不弱化回归覆盖。
      client.post("/stable", { b: 2, a: 1 }, { params: { z: 3, a: 1 } }),
      client.post("/stable", { a: 1, b: 2 }, { params: { a: 1, z: 3 } }),
    ]);
    expect(context.calls).toBe(1);

    await Promise.all([
      client.post("/unstable", new Map([["a", 1]])),
      client.post("/unstable", new Map([["a", 1]])),
    ]);
    expect(context.calls).toBe(3);

    await Promise.all([
      client.post("/explicit/a", new Map([["a", 1]]), { dedupeKey: "same" }),
      client.post("/explicit/a", new Map([["a", 1]]), { dedupeKey: "same" }),
    ]);
    expect(context.calls).toBe(4);

    await Promise.all([
      client.post("/explicit/a", new Map([["a", 1]]), { dedupeKey: "same" }),
      client.post("/explicit/b", new Map([["a", 1]]), { dedupeKey: "same" }),
    ]);
    expect(context.calls).toBe(6);
  });
});
