import type { RawAxiosRequestHeaders } from "axios";
import { type Observable, of } from "rxjs";
import { describe, expectTypeOf, it } from "vitest";
import {
  PromiseHttpClient,
  type PromiseHttpClientOptions,
  type PromiseHttpSuccess,
} from "../src/axios/http.js";
import { type HttpClientOptions, type HttpSuccess, RxHttpClient } from "../src/rxjs/http.js";

interface Payload {
  name: string;
}

describe("HTTP 返回值转换的类型契约", () => {
  // 这些函数只参加 tsc 检查，不执行其中的请求，避免 Promise 客户端访问网络。
  it("未设置转换时，构造函数和工厂保留原有成功结果类型", () => {
    const assertTypes = () => {
      const rx = new RxHttpClient();
      const promise = new PromiseHttpClient();
      expectTypeOf(rx.request<Payload>({ method: "GET", url: "/user" })).toEqualTypeOf<
        Observable<HttpSuccess<Payload>>
      >();
      expectTypeOf(rx.get<Payload>("/user")).toEqualTypeOf<Observable<HttpSuccess<Payload>>>();
      expectTypeOf(rx.post<Payload>("/user")).toEqualTypeOf<Observable<HttpSuccess<Payload>>>();
      expectTypeOf(rx.put<Payload>("/user")).toEqualTypeOf<Observable<HttpSuccess<Payload>>>();
      expectTypeOf(rx.patch<Payload>("/user")).toEqualTypeOf<Observable<HttpSuccess<Payload>>>();
      expectTypeOf(rx.delete<Payload>("/user")).toEqualTypeOf<Observable<HttpSuccess<Payload>>>();
      expectTypeOf(promise.request<Payload>({ method: "GET", url: "/user" })).toEqualTypeOf<
        Promise<PromiseHttpSuccess<Payload>>
      >();
      expectTypeOf(promise.get<Payload>("/user")).toEqualTypeOf<
        Promise<PromiseHttpSuccess<Payload>>
      >();
      expectTypeOf(promise.post<Payload>("/user")).toEqualTypeOf<
        Promise<PromiseHttpSuccess<Payload>>
      >();
      expectTypeOf(promise.put<Payload>("/user")).toEqualTypeOf<
        Promise<PromiseHttpSuccess<Payload>>
      >();
      expectTypeOf(promise.patch<Payload>("/user")).toEqualTypeOf<
        Promise<PromiseHttpSuccess<Payload>>
      >();
      expectTypeOf(promise.delete<Payload>("/user")).toEqualTypeOf<
        Promise<PromiseHttpSuccess<Payload>>
      >();

      expectTypeOf(RxHttpClient.create(() => of({})).get<Payload>("/user")).toEqualTypeOf<
        Observable<HttpSuccess<Payload>>
      >();
      expectTypeOf(PromiseHttpClient.create(() => ({})).get<Payload>("/user")).toEqualTypeOf<
        Promise<PromiseHttpSuccess<Payload>>
      >();
      expectTypeOf(new RxHttpClient({ timeout: 300 }).get<Payload>("/user")).toEqualTypeOf<
        Observable<HttpSuccess<Payload>>
      >();
      expectTypeOf(new PromiseHttpClient({ timeout: 300 }).get<Payload>("/user")).toEqualTypeOf<
        Promise<PromiseHttpSuccess<Payload>>
      >();

      const rxOptions: HttpClientOptions<undefined> = {};
      const promiseOptions: PromiseHttpClientOptions<undefined> = {};
      expectTypeOf(new RxHttpClient(rxOptions).get<Payload>("/user")).toEqualTypeOf<
        Observable<HttpSuccess<Payload>>
      >();
      expectTypeOf(new PromiseHttpClient(promiseOptions).get<Payload>("/user")).toEqualTypeOf<
        Promise<PromiseHttpSuccess<Payload>>
      >();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("内联回调获得完整成功结果上下文，各请求方法推导回调返回值", () => {
    const assertTypes = () => {
      const rx = new RxHttpClient({
        transformHeaders: (headers) => {
          expectTypeOf(headers).toEqualTypeOf<RawAxiosRequestHeaders>();
          return { ...headers, Authorization: "Bearer token" };
        },
        transformResponse: (result) => {
          expectTypeOf(result).toEqualTypeOf<HttpSuccess<unknown>>();
          return result.code.toString();
        },
      });
      const promise = new PromiseHttpClient({
        transformHeaders: (headers) => {
          expectTypeOf(headers).toEqualTypeOf<RawAxiosRequestHeaders>();
          return { ...headers, Authorization: "Bearer token" };
        },
        transformResponse: (result) => {
          expectTypeOf(result).toEqualTypeOf<PromiseHttpSuccess<unknown>>();
          return result.code.toString();
        },
      });
      expectTypeOf(rx.request<Payload>({ method: "GET", url: "/user" })).toEqualTypeOf<
        Observable<string>
      >();
      expectTypeOf(rx.get<Payload>("/user")).toEqualTypeOf<Observable<string>>();
      expectTypeOf(rx.post<Payload, Payload>("/user", { name: "Ada" })).toEqualTypeOf<
        Observable<string>
      >();
      expectTypeOf(rx.put<Payload>("/user")).toEqualTypeOf<Observable<string>>();
      expectTypeOf(rx.patch<Payload>("/user")).toEqualTypeOf<Observable<string>>();
      expectTypeOf(rx.delete<Payload>("/user")).toEqualTypeOf<Observable<string>>();
      expectTypeOf(promise.request<Payload>({ method: "GET", url: "/user" })).toEqualTypeOf<
        Promise<string>
      >();
      expectTypeOf(promise.get<Payload>("/user")).toEqualTypeOf<Promise<string>>();
      expectTypeOf(promise.post<Payload, Payload>("/user", { name: "Ada" })).toEqualTypeOf<
        Promise<string>
      >();
      expectTypeOf(promise.put<Payload>("/user")).toEqualTypeOf<Promise<string>>();
      expectTypeOf(promise.patch<Payload>("/user")).toEqualTypeOf<Promise<string>>();
      expectTypeOf(promise.delete<Payload>("/user")).toEqualTypeOf<Promise<string>>();

      const rxFactory = RxHttpClient.create(() => of({}), {
        transformResponse: (result) => {
          expectTypeOf(result).toEqualTypeOf<HttpSuccess<unknown>>();
          return { status: result.code };
        },
      });
      const promiseFactory = PromiseHttpClient.create(() => ({}), {
        transformResponse: (result) => {
          expectTypeOf(result).toEqualTypeOf<PromiseHttpSuccess<unknown>>();
          return { status: result.code };
        },
      });
      expectTypeOf(rxFactory.get<Payload>("/user")).toEqualTypeOf<Observable<{ status: number }>>();
      expectTypeOf(promiseFactory.get<Payload>("/user")).toEqualTypeOf<
        Promise<{ status: number }>
      >();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("允许声明业务响应结构，并从构造选项和工厂选项推导输出", () => {
    const assertTypes = () => {
      const rxOptions = {
        transformResponse: (result: HttpSuccess<Payload>) => result.data.name,
      } satisfies HttpClientOptions;
      const promiseOptions = {
        transformResponse: (result: PromiseHttpSuccess<Payload>) => result.data.name,
      } satisfies PromiseHttpClientOptions;
      expectTypeOf(new RxHttpClient(rxOptions).get<Payload>("/user")).toEqualTypeOf<
        Observable<string>
      >();
      expectTypeOf(new PromiseHttpClient(promiseOptions).get<Payload>("/user")).toEqualTypeOf<
        Promise<string>
      >();
      expectTypeOf(
        RxHttpClient.create(() => of({}), rxOptions).get<Payload>("/user"),
      ).toEqualTypeOf<Observable<string>>();
      expectTypeOf(
        PromiseHttpClient.create(() => ({}), promiseOptions).get<Payload>("/user"),
      ).toEqualTypeOf<Promise<string>>();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("区分缺少回调、回调返回 undefined、never 和可能缺省的回调", () => {
    const assertTypes = () => {
      expectTypeOf(
        new RxHttpClient({ transformResponse: undefined }).get<Payload>("/user"),
      ).toEqualTypeOf<Observable<HttpSuccess<Payload>>>();
      expectTypeOf(
        new PromiseHttpClient({ transformResponse: undefined }).get<Payload>("/user"),
      ).toEqualTypeOf<Promise<PromiseHttpSuccess<Payload>>>();
      expectTypeOf(
        new RxHttpClient({ transformResponse: () => undefined }).get<Payload>("/user"),
      ).toEqualTypeOf<Observable<undefined>>();
      expectTypeOf(
        new PromiseHttpClient({ transformResponse: () => undefined }).get<Payload>("/user"),
      ).toEqualTypeOf<Promise<undefined>>();

      const fail = (): never => {
        throw new Error("业务转换失败");
      };
      expectTypeOf(
        new RxHttpClient({ transformResponse: fail }).get<Payload>("/user"),
      ).toEqualTypeOf<Observable<never>>();
      expectTypeOf(
        new PromiseHttpClient({ transformResponse: fail }).get<Payload>("/user"),
      ).toEqualTypeOf<Promise<never>>();

      const rxOptions: HttpClientOptions<(result: HttpSuccess<Payload>) => string> = {};
      const promiseOptions: PromiseHttpClientOptions<
        (result: PromiseHttpSuccess<Payload>) => string
      > = {};
      expectTypeOf(new RxHttpClient(rxOptions).get<Payload>("/user")).toEqualTypeOf<
        Observable<string | HttpSuccess<Payload>>
      >();
      expectTypeOf(new PromiseHttpClient(promiseOptions).get<Payload>("/user")).toEqualTypeOf<
        Promise<string | PromiseHttpSuccess<Payload>>
      >();

      const maybeTransform = (enabled: boolean): (() => string) | undefined =>
        enabled ? () => "完成" : undefined;
      expectTypeOf(
        new RxHttpClient({ transformResponse: maybeTransform(true) }).get<Payload>("/user"),
      ).toEqualTypeOf<Observable<string | HttpSuccess<Payload>>>();
      expectTypeOf(
        new PromiseHttpClient({ transformResponse: maybeTransform(true) }).get<Payload>("/user"),
      ).toEqualTypeOf<Promise<string | PromiseHttpSuccess<Payload>>>();

      const broadRxOptions: HttpClientOptions = { transformResponse: () => "已转换" };
      const broadPromiseOptions: PromiseHttpClientOptions = { transformResponse: () => "已转换" };
      expectTypeOf(new RxHttpClient(broadRxOptions).get<Payload>("/user")).toEqualTypeOf<
        Observable<unknown>
      >();
      expectTypeOf(new PromiseHttpClient(broadPromiseOptions).get<Payload>("/user")).toEqualTypeOf<
        Promise<unknown>
      >();

      const fromOptions = (
        rxOptions: HttpClientOptions,
        promiseOptions: PromiseHttpClientOptions,
      ) => {
        expectTypeOf(new RxHttpClient(rxOptions).get<Payload>("/user")).toEqualTypeOf<
          Observable<unknown>
        >();
        expectTypeOf(new PromiseHttpClient(promiseOptions).get<Payload>("/user")).toEqualTypeOf<
          Promise<unknown>
        >();
        expectTypeOf(
          RxHttpClient.create(() => of({}), rxOptions).get<Payload>("/user"),
        ).toEqualTypeOf<Observable<unknown>>();
        expectTypeOf(
          PromiseHttpClient.create(() => ({}), promiseOptions).get<Payload>("/user"),
        ).toEqualTypeOf<Promise<unknown>>();
      };
      expectTypeOf(fromOptions).toBeFunction();

      const pickedRxOptions: Pick<HttpClientOptions, "transformResponse"> = broadRxOptions;
      const pickedPromiseOptions: Pick<PromiseHttpClientOptions, "transformResponse"> =
        broadPromiseOptions;
      expectTypeOf(new RxHttpClient(pickedRxOptions).get<Payload>("/user")).toEqualTypeOf<
        Observable<unknown>
      >();
      expectTypeOf(new PromiseHttpClient(pickedPromiseOptions).get<Payload>("/user")).toEqualTypeOf<
        Promise<unknown>
      >();

      // 显式泛型不能声称存在转换器却在运行时遗漏它。
      // @ts-expect-error 必须同时提供泛型中声明的 transformResponse。
      new RxHttpClient<{ transformResponse: () => string }>();
      // @ts-expect-error 必须同时提供泛型中声明的 transformResponse。
      new PromiseHttpClient<{ transformResponse: () => string }>();
      // @ts-expect-error 工厂的显式选项泛型要求提供对应选项。
      RxHttpClient.create<{ transformResponse: () => string }>(() => of({}));
      // @ts-expect-error 工厂的显式选项泛型要求提供对应选项。
      PromiseHttpClient.create<{ transformResponse: () => string }>(() => ({}));
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("异步回调解包 Promise，泛型回调不伪造每次请求的类型关联", () => {
    const assertTypes = () => {
      const rx = new RxHttpClient({
        transformResponse: async (result: HttpSuccess<Payload>) => result.data.name,
      });
      const promise = PromiseHttpClient.create(() => ({}), {
        transformResponse: async (result: PromiseHttpSuccess<Payload>) => result.data.name,
      });
      expectTypeOf(rx.get<Payload>("/user")).toEqualTypeOf<Observable<string>>();
      expectTypeOf(promise.get<Payload>("/user")).toEqualTypeOf<Promise<string>>();

      const genericRx = new RxHttpClient({
        transformResponse: <T>(result: HttpSuccess<T>) => result.data,
      });
      const genericPromise = new PromiseHttpClient({
        transformResponse: <T>(result: PromiseHttpSuccess<T>) => result.data,
      });
      expectTypeOf(genericRx.get<Payload>("/user")).toEqualTypeOf<Observable<unknown>>();
      expectTypeOf(genericPromise.get<Payload>("/user")).toEqualTypeOf<Promise<unknown>>();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("RxJS 展开 Observable 的发值类型，Promise 客户端展开 Promise 的结果类型", () => {
    const assertTypes = () => {
      const transformResponse = (result: HttpSuccess<Payload>) => of(result.data.name);
      const rx = new RxHttpClient({ transformResponse });
      const created = RxHttpClient.create(() => of({}), { transformResponse });
      expectTypeOf(rx.request<Payload>({ method: "GET", url: "/user" })).toEqualTypeOf<
        Observable<string>
      >();
      expectTypeOf(rx.get<Payload>("/user")).toEqualTypeOf<Observable<string>>();
      expectTypeOf(rx.post<Payload>("/user")).toEqualTypeOf<Observable<string>>();
      expectTypeOf(rx.put<Payload>("/user")).toEqualTypeOf<Observable<string>>();
      expectTypeOf(rx.patch<Payload>("/user")).toEqualTypeOf<Observable<string>>();
      expectTypeOf(rx.delete<Payload>("/user")).toEqualTypeOf<Observable<string>>();
      expectTypeOf(created.get<Payload>("/user")).toEqualTypeOf<Observable<string>>();

      const promisedStream = new RxHttpClient({
        transformResponse: async () => of({ name: "Ada" }),
      });
      expectTypeOf(promisedStream.get("/user")).toEqualTypeOf<Observable<Payload>>();
      const union = new RxHttpClient({
        transformResponse: (result): string | Observable<number> =>
          result.code === 200 ? of(1) : "cached",
      });
      expectTypeOf(union.get("/user")).toEqualTypeOf<Observable<string | number>>();
      const optional: HttpClientOptions<typeof transformResponse> = {};
      expectTypeOf(new RxHttpClient(optional).get<Payload>("/user")).toEqualTypeOf<
        Observable<string | HttpSuccess<Payload>>
      >();

      const array = new RxHttpClient({ transformResponse: () => [1, 2] });
      expectTypeOf(array.get("/array")).toEqualTypeOf<Observable<number[]>>();
      const nested = new RxHttpClient({ transformResponse: () => of(of(1)) });
      expectTypeOf(nested.get("/nested")).toEqualTypeOf<Observable<Observable<number>>>();

      const promiseTransform = async (result: PromiseHttpSuccess<Payload>) => ({
        name: result.data.name,
      });
      const promise = new PromiseHttpClient({ transformResponse: promiseTransform });
      const promiseCreated = PromiseHttpClient.create(() => ({}), {
        transformResponse: promiseTransform,
      });
      expectTypeOf(promise.get("/user")).toEqualTypeOf<Promise<Payload>>();
      expectTypeOf(promiseCreated.get("/user")).toEqualTypeOf<Promise<Payload>>();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("兼容可能为 undefined 的旧选项参数，同时保留转换器缺省的分支", () => {
    const assertTypes = (
      rxOptions: HttpClientOptions | undefined,
      promiseOptions: PromiseHttpClientOptions | undefined,
      rxDefaultOptions: HttpClientOptions<undefined> | undefined,
      promiseDefaultOptions: PromiseHttpClientOptions<undefined> | undefined,
      mappedOptions: { transformResponse: () => number } | undefined,
    ) => {
      expectTypeOf(new RxHttpClient(rxOptions).get<Payload>("/user")).toEqualTypeOf<
        Observable<unknown>
      >();
      expectTypeOf(new PromiseHttpClient(promiseOptions).get<Payload>("/user")).toEqualTypeOf<
        Promise<unknown>
      >();
      expectTypeOf(
        RxHttpClient.create(() => of({}), rxOptions).get<Payload>("/user"),
      ).toEqualTypeOf<Observable<unknown>>();
      expectTypeOf(
        PromiseHttpClient.create(() => ({}), promiseOptions).get<Payload>("/user"),
      ).toEqualTypeOf<Promise<unknown>>();

      expectTypeOf(new RxHttpClient(rxDefaultOptions).get<Payload>("/user")).toEqualTypeOf<
        Observable<HttpSuccess<Payload>>
      >();
      expectTypeOf(
        new PromiseHttpClient(promiseDefaultOptions).get<Payload>("/user"),
      ).toEqualTypeOf<Promise<PromiseHttpSuccess<Payload>>>();
      expectTypeOf(
        RxHttpClient.create(() => of({}), rxDefaultOptions).get<Payload>("/user"),
      ).toEqualTypeOf<Observable<HttpSuccess<Payload>>>();
      expectTypeOf(
        PromiseHttpClient.create(() => ({}), promiseDefaultOptions).get<Payload>("/user"),
      ).toEqualTypeOf<Promise<PromiseHttpSuccess<Payload>>>();

      expectTypeOf(new RxHttpClient(mappedOptions).get<Payload>("/user")).toEqualTypeOf<
        Observable<number | HttpSuccess<Payload>>
      >();
      expectTypeOf(new PromiseHttpClient(mappedOptions).get<Payload>("/user")).toEqualTypeOf<
        Promise<number | PromiseHttpSuccess<Payload>>
      >();
      expectTypeOf(
        RxHttpClient.create(() => of({}), mappedOptions).get<Payload>("/user"),
      ).toEqualTypeOf<Observable<number | HttpSuccess<Payload>>>();
      expectTypeOf(
        PromiseHttpClient.create(() => ({}), mappedOptions).get<Payload>("/user"),
      ).toEqualTypeOf<Promise<number | PromiseHttpSuccess<Payload>>>();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });
});
