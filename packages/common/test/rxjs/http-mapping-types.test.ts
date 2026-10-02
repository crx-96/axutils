import type { RawAxiosRequestHeaders } from "axios";
import { type Observable, of } from "rxjs";
import { describe, expectTypeOf, it } from "vitest";
import {
  type HttpClientOptions,
  type HttpMappedClientOptions,
  type HttpRequestError,
  type HttpResponseTypeMap,
  type HttpSuccess,
  RxHttpClient,
} from "../../src/rxjs/http.js";

interface ApiResult<T> {
  code: number;
  message: string;
  data: T | null;
  request_id: string;
  timestamp: number;
  signature: string;
}

interface ApiMapping extends HttpResponseTypeMap {
  readonly body: ApiResult<this["data"]>;
  readonly result: ApiResult<this["data"]>;
  readonly error: ApiResult<this["data"]>;
}

interface FailureResult {
  failed: true;
  reason: string;
}

interface DistinctErrorMapping extends HttpResponseTypeMap {
  readonly body: ApiResult<this["data"]>;
  readonly result: ApiResult<this["data"]>;
  readonly error: FailureResult;
}

interface IdentityMapping extends HttpResponseTypeMap {
  readonly body: this["data"];
  readonly result: this["data"];
  readonly error: FailureResult;
}

interface UserVO {
  id: number;
  displayName: string;
}

interface LoginVO {
  accessToken: string;
  expiresIn: number;
}

interface LoginDTO {
  username: string;
  password: string;
}

const emptyResult = <T>(error: HttpRequestError): ApiResult<T> => ({
  code: error.code,
  data: null,
  message: error.message,
  request_id: "",
  signature: "",
  timestamp: 0,
});

describe("rxjs/http 显式响应类型映射", () => {
  it("一次声明映射后，所有请求方法保留各自的响应与请求体泛型", () => {
    const assertTypes = () => {
      const client = RxHttpClient.withTypes<ApiMapping>().configure({
        transformError: emptyResult,
        transformHeaders: (headers) => {
          expectTypeOf(headers).toEqualTypeOf<RawAxiosRequestHeaders>();
          return { ...headers, Authorization: "Bearer token" };
        },
        transformResponse: <T>(result: HttpSuccess<ApiResult<T>>) => of(result.data),
      });
      const body: LoginDTO = { password: "test", username: "Ada" };

      expectTypeOf(client.get<UserVO>("/user")).toEqualTypeOf<Observable<ApiResult<UserVO>>>();
      expectTypeOf(client.get<LoginVO>("/login")).toEqualTypeOf<Observable<ApiResult<LoginVO>>>();
      expectTypeOf(
        client.request<UserVO, LoginDTO>({ data: body, method: "POST", url: "/user" }),
      ).toEqualTypeOf<Observable<ApiResult<UserVO>>>();
      expectTypeOf(client.post<LoginVO, LoginDTO>("/login", body)).toEqualTypeOf<
        Observable<ApiResult<LoginVO>>
      >();
      expectTypeOf(client.put<UserVO, LoginDTO>("/user", body)).toEqualTypeOf<
        Observable<ApiResult<UserVO>>
      >();
      expectTypeOf(client.patch<UserVO, LoginDTO>("/user", body)).toEqualTypeOf<
        Observable<ApiResult<UserVO>>
      >();
      expectTypeOf(client.delete<UserVO>("/user")).toEqualTypeOf<Observable<ApiResult<UserVO>>>();

      // @ts-expect-error 请求体泛型继续约束 post 的 data。
      client.post<LoginVO, LoginDTO>("/login", { username: "Ada" });
      // @ts-expect-error request 的请求体泛型不会因响应映射而丢失。
      client.request<UserVO, LoginDTO>({ data: { id: 1 }, method: "POST", url: "/user" });
      // @ts-expect-error 不同接口的载荷不会退化成 unknown 或可相互赋值的类型。
      const incorrect: Observable<ApiResult<LoginVO>> = client.get<UserVO>("/user");
      expectTypeOf(incorrect).toEqualTypeOf<Observable<ApiResult<LoginVO>>>();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("上下文泛型与 satisfies 保留映射，create 使用相同契约", () => {
    const assertTypes = () => {
      const options = {
        transformError: emptyResult,
        transformResponse: (result) => result.data,
      } satisfies HttpMappedClientOptions<ApiMapping>;
      const factory = RxHttpClient.withTypes<ApiMapping>();
      const configured = factory.configure(options);
      const created = factory.create(() => of({ baseUrl: "/api" }), options);
      expectTypeOf(configured.get<UserVO>("/user")).toEqualTypeOf<Observable<ApiResult<UserVO>>>();
      expectTypeOf(created.get<LoginVO>("/login")).toEqualTypeOf<Observable<ApiResult<LoginVO>>>();

      const contextual = factory.configure({
        transformError: (error) => ({
          code: error.code,
          data: null,
          message: error.message,
          request_id: "",
          signature: "",
          timestamp: 0,
        }),
        transformResponse: (result) => of(result.data),
      });
      expectTypeOf(contextual.get<UserVO>("/user")).toEqualTypeOf<Observable<ApiResult<UserVO>>>();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("成功与错误结果不同时准确联合，并支持 Promise 返回 Observable", () => {
    const assertTypes = () => {
      const client = RxHttpClient.withTypes<DistinctErrorMapping>().configure({
        transformError: async (error) => of({ failed: true, reason: error.message }),
        transformResponse: async (result) => of(result.data),
      });
      expectTypeOf(client.get<UserVO>("/user")).toEqualTypeOf<
        Observable<ApiResult<UserVO> | FailureResult>
      >();
      expectTypeOf(client.post<LoginVO, LoginDTO>("/login")).toEqualTypeOf<
        Observable<ApiResult<LoginVO> | FailureResult>
      >();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("缺省和可选回调保留各个实际可能的结果分支", () => {
    const assertTypes = () => {
      const factory = RxHttpClient.withTypes<DistinctErrorMapping>();
      const plain = factory.configure({});
      expectTypeOf(plain.get<UserVO>("/user")).toEqualTypeOf<
        Observable<HttpSuccess<ApiResult<UserVO>>>
      >();

      const successOnly = factory.configure({ transformResponse: (result) => result.data });
      expectTypeOf(successOnly.get<UserVO>("/user")).toEqualTypeOf<Observable<ApiResult<UserVO>>>();

      const errorOnly = factory.configure({
        transformError: (error) => ({ failed: true, reason: error.message }),
      });
      expectTypeOf(errorOnly.get<UserVO>("/user")).toEqualTypeOf<
        Observable<HttpSuccess<ApiResult<UserVO>> | FailureResult>
      >();

      const optionalOptions: HttpMappedClientOptions<DistinctErrorMapping> = {
        transformResponse: (result) => result.data,
      };
      const optional = factory.configure(optionalOptions);
      expectTypeOf(optional.get<UserVO>("/user")).toEqualTypeOf<
        Observable<HttpSuccess<ApiResult<UserVO>> | ApiResult<UserVO> | FailureResult>
      >();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("映射约束真实回调，拒绝错误输入、固定载荷和不匹配的返回值", () => {
    const assertTypes = () => {
      const factory = RxHttpClient.withTypes<ApiMapping>();
      const wrongResult = () => ({ wrong: true });
      const fixedResponse = (result: HttpSuccess<ApiResult<UserVO>>) => result.data;
      const fixedError = (error: HttpRequestError): ApiResult<UserVO> => ({
        ...emptyResult<UserVO>(error),
        data: { displayName: "Ada", id: 1 },
      });
      const wrongInput = (result: HttpSuccess<{ differentBody: string }>): ApiResult<never> => ({
        code: result.code,
        data: null,
        message: "",
        request_id: "",
        signature: "",
        timestamp: 0,
      });

      // @ts-expect-error 返回值必须满足调用方声明的 result 映射。
      factory.configure({ transformResponse: wrongResult });
      // @ts-expect-error 固定 UserVO 不能冒充支持所有请求载荷 T 的回调。
      factory.configure({ transformResponse: fixedResponse });
      // @ts-expect-error error 映射也必须适用于每次请求的 T。
      factory.configure({ transformError: fixedError });
      // @ts-expect-error 即使返回值兼容，输入也必须接受声明的 ApiResult<T>。
      factory.configure({ transformResponse: wrongInput });
      // @ts-expect-error create 与 configure 具有相同的映射约束。
      factory.create(() => of({}), { transformResponse: wrongResult });
      // @ts-expect-error 直接显式构造泛型实例也不能绕过映射检查。
      new RxHttpClient<{ transformResponse: typeof wrongResult }, ApiMapping>({
        transformResponse: wrongResult,
      });
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("未配置映射时仍推导固定转换结果与错误结果的联合", () => {
    const assertTypes = () => {
      const client = new RxHttpClient({
        transformError: (error) => {
          expectTypeOf(error).toEqualTypeOf<HttpRequestError>();
          return Promise.resolve(of(error.code));
        },
        transformResponse: (result: HttpSuccess<UserVO>) => of(result.data.displayName),
      });
      expectTypeOf(client.get<UserVO>("/user")).toEqualTypeOf<Observable<string | number>>();

      const transformResponse = (result: HttpSuccess<UserVO>) => result.data.displayName;
      const transformError = (error: HttpRequestError) => error.code;
      const options = { transformError, transformResponse } satisfies HttpClientOptions<
        typeof transformResponse,
        typeof transformError
      >;
      const created = RxHttpClient.create(() => of({}), options);
      expectTypeOf(created.post<UserVO, LoginDTO>("/user")).toEqualTypeOf<
        Observable<string | number>
      >();
      const errorOnly = new RxHttpClient({ transformError });
      expectTypeOf(errorOnly.get<UserVO>("/user")).toEqualTypeOf<
        Observable<HttpSuccess<UserVO> | number>
      >();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("载荷本身是 Observable 或 Promise 时必须明确保留为业务值", () => {
    const assertTypes = () => {
      const factory = RxHttpClient.withTypes<IdentityMapping>();
      const client = factory.configure({ transformResponse: (result) => of(result.data) });
      expectTypeOf(client.get<UserVO>("/user")).toEqualTypeOf<Observable<UserVO>>();
      expectTypeOf(client.get<Observable<UserVO>>("/stream")).toEqualTypeOf<
        Observable<Observable<UserVO>>
      >();
      expectTypeOf(client.get<Promise<UserVO>>("/promise")).toEqualTypeOf<
        Observable<Promise<UserVO>>
      >();

      const unwrap = <T>(result: HttpSuccess<T>) => result.data;
      // @ts-expect-error T 可能是流或 Promise，直接返回将被展开，不能满足保留 T 的映射。
      factory.configure({ transformResponse: unwrap });
    };
    expectTypeOf(assertTypes).toBeFunction();
  });

  it("旧的 options 单泛型与无转换调用保持原返回类型", () => {
    const assertTypes = () => {
      const noTransform: HttpClientOptions<undefined> = { timeout: 500 };
      const plain = new RxHttpClient(noTransform);
      expectTypeOf(plain.get<UserVO>("/user")).toEqualTypeOf<Observable<HttpSuccess<UserVO>>>();

      const transformResponse = (result: HttpSuccess<UserVO>) => result.data.displayName;
      const fixedOptions: HttpClientOptions<typeof transformResponse> = { transformResponse };
      const fixed = new RxHttpClient(fixedOptions);
      expectTypeOf(fixed.get<UserVO>("/user")).toEqualTypeOf<
        Observable<HttpSuccess<UserVO> | string>
      >();
      expectTypeOf(new RxHttpClient().get<UserVO>("/user")).toEqualTypeOf<
        Observable<HttpSuccess<UserVO>>
      >();
    };
    expectTypeOf(assertTypes).toBeFunction();
  });
});
