import { type Observable, of } from "rxjs";
import { describe, expectTypeOf, it } from "vitest";
import {
  type HttpRequestContext,
  type HttpResponseTransformer,
  type HttpResponseTypeMap,
  type HttpSuccess,
  RxHttpClient,
} from "../../src/rxjs/http.js";

interface Session {
  identity: number;
  token: string;
}

interface ApiResponse<T> {
  data: T | null;
  code: number;
}

interface Mapping extends HttpResponseTypeMap {
  readonly body: ApiResponse<this["data"]>;
  readonly result: ApiResponse<this["data"]>;
  readonly error: ApiResponse<this["data"]>;
}

describe("rxjs/http 订阅上下文类型", () => {
  it("具体响应体标注仍可用，但回调不能窄化工厂返回的上下文", () => {
    const assertTypes = () => {
      type OptionalToken = { token?: string };
      const transform = (
        response: HttpSuccess<{ name: string }>,
        request: HttpRequestContext<{ token: string }>,
      ) => `${request.context?.token.toUpperCase()}:${response.data.name}`;
      // @ts-expect-error 工厂的上下文不能保证 token 存在，成功回调必须处理缺失字段。
      new RxHttpClient({ createContext: (): OptionalToken => ({}), transformResponse: transform });
      // @ts-expect-error 异步配置入口同样不能由回调将上下文反向窄化。
      RxHttpClient.create(() => of({}), {
        createContext: (): OptionalToken => ({}),
        transformResponse: transform,
      });
      // @ts-expect-error 单独声明成功转换器时也应拒绝不安全的上下文类型。
      const invalid: HttpResponseTransformer<OptionalToken> = transform;
      void invalid;

      const client = new RxHttpClient({
        createContext: (): OptionalToken => ({}),
        transformResponse: (
          response: HttpSuccess<{ name: string }>,
          request: HttpRequestContext<OptionalToken>,
        ) => `${request.context?.token?.toUpperCase()}:${response.data.name}`,
      });
      expectTypeOf(client.get("/user")).toEqualTypeOf<Observable<string>>();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("构造和 create 从工厂返回值推导上下文，转换结果保留具体类型", () => {
    const assertTypes = () => {
      const client = new RxHttpClient({
        createContext: () => ({ identity: 1, token: "token" }),
        transformHeaders: (headers, request) => {
          expectTypeOf(request.context).toEqualTypeOf<Session | undefined>();
          return headers;
        },
        transformResponse: (_response, request) => {
          expectTypeOf(request).toEqualTypeOf<HttpRequestContext<Session>>();
          return request.context?.identity;
        },
      });
      expectTypeOf(client.get("/user")).toEqualTypeOf<Observable<number | undefined>>();
      const created = RxHttpClient.create(() => of({}), {
        createContext: (): Session => ({ identity: 1, token: "token" }),
        transformError: (_error, request) => {
          expectTypeOf(request.context).toEqualTypeOf<Session | undefined>();
          return of(request.context?.token);
        },
        transformResponse: (_response, request) => Promise.resolve(request.context?.token),
      });
      expectTypeOf(created.get("/user")).toEqualTypeOf<Observable<string | undefined>>();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("映射模式可指定上下文且继续约束每个请求的 T/D", () => {
    const assertTypes = () => {
      const client = RxHttpClient.withTypes<Mapping, Session>().create(() => of({}), {
        createContext: () => ({ identity: 1, token: "token" }),
        transformError: (_error, request) => {
          expectTypeOf(request.context).toEqualTypeOf<Session | undefined>();
          // @ts-expect-error 初始化失败时上下文可能不存在。
          request.context.token;
          // @ts-expect-error 请求头可能尚未确定。
          request.headers.Authorization;
          return { code: 0, data: null };
        },
        transformHeaders: (headers, request) => {
          expectTypeOf(request.context).toEqualTypeOf<Session | undefined>();
          return headers;
        },
        transformResponse: (response, request) => {
          expectTypeOf(request).toEqualTypeOf<HttpRequestContext<Session>>();
          if (request.headers) {
            // @ts-expect-error 元信息是只读快照，不能改变实际传输的请求头。
            request.headers.Authorization = "other";
          }
          return of(response.data);
        },
      });
      type User = { name: string };
      type Body = { id: number };
      expectTypeOf(client.get<User>("/user")).toEqualTypeOf<Observable<ApiResponse<User>>>();
      expectTypeOf(client.post<User, Body>("/user", { id: 1 })).toEqualTypeOf<
        Observable<ApiResponse<User>>
      >();
      expectTypeOf(client.put<User, Body>("/user", { id: 1 })).toEqualTypeOf<
        Observable<ApiResponse<User>>
      >();
      expectTypeOf(client.patch<User, Body>("/user", { id: 1 })).toEqualTypeOf<
        Observable<ApiResponse<User>>
      >();
      expectTypeOf(client.delete<User>("/user")).toEqualTypeOf<Observable<ApiResponse<User>>>();
      expectTypeOf(
        client.request<User, Body>({ data: { id: 1 }, method: "POST", url: "/user" }),
      ).toEqualTypeOf<Observable<ApiResponse<User>>>();
      // @ts-expect-error 请求体仍受 D 约束。
      client.post<User, Body>("/user", { id: "wrong" });
      RxHttpClient.withTypes<Mapping, Session>().configure({
        // @ts-expect-error 显式上下文类型约束工厂返回值。
        createContext: () => ({ token: "missing identity" }),
      });
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("只指定响应映射时，create 和 configure 仍从 createContext 推导上下文", () => {
    const assertTypes = () => {
      const client = RxHttpClient.withTypes<Mapping>().create(() => of({}), {
        createContext: () => ({ identity: 1, token: "token" }),
        transformResponse: (response, request) => {
          expectTypeOf(request.context).toEqualTypeOf<Session | undefined>();
          return response.data;
        },
      });
      const configured = RxHttpClient.withTypes<Mapping>().configure({
        createContext: () => ({ identity: 1, token: "token" }),
        transformError: (_error, request) => {
          expectTypeOf(request.context).toEqualTypeOf<Session | undefined>();
          return { code: 0, data: null };
        },
        transformResponse: (response) => response.data,
      });
      expectTypeOf(client.get<number>("/value")).toEqualTypeOf<Observable<ApiResponse<number>>>();
      expectTypeOf(configured.get<string>("/value")).toEqualTypeOf<
        Observable<ApiResponse<string>>
      >();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });
});
