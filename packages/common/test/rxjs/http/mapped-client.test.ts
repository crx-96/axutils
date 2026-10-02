import { isAxiosError } from "axios";
import { firstValueFrom, of } from "rxjs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type HttpResponseTypeMap,
  type HttpSuccess,
  RxHttpClient,
} from "../../../src/rxjs/http.js";
import { createAxiosInstance, response } from "../../helpers/http/adapter.js";

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

interface UserVO {
  id: number;
  name: string;
}
interface LoginVO {
  token: string;
}
interface LoginDTO {
  username: string;
}

function apiResult<T>(data: T | null, code = 0, requestId = "request-1"): ApiResult<T> {
  return {
    code,
    data,
    message: "message",
    request_id: requestId,
    signature: "signature",
    timestamp: 123,
  };
}

describe("rxjs/http 映射客户端集成", () => {
  it.each([false, true])("配置一次后直接调用不同业务接口（create=%s）", async (useFactory) => {
    const { context, instance } = createAxiosInstance((config) => {
      if (config.url?.endsWith("/login"))
        return response(config, apiResult({ token: "new-token" }));
      if (config.url?.endsWith("/unavailable"))
        return response(config, apiResult(null, 503, "failed-request"), 503);
      return response(config, apiResult({ id: 1, name: "Ada" }));
    });
    let token = "first-token";
    const factory = RxHttpClient.withTypes<ApiMapping>();
    const options = {
      axiosInstance: instance,
      retryCount: 1,
      transformError: <T>(
        error: import("../../../src/rxjs/http.js").HttpRequestError,
      ): ApiResult<T> => {
        const cause = error.error.cause;
        const body = isAxiosError<unknown>(cause) ? cause.response?.data : undefined;
        const requestId =
          typeof body === "object" &&
          body !== null &&
          "request_id" in body &&
          typeof body.request_id === "string"
            ? body.request_id
            : "";
        return apiResult<T>(null, error.code, requestId);
      },
      transformHeaders: (headers: import("axios").RawAxiosRequestHeaders) => ({
        ...headers,
        Authorization: `Bearer ${token}`,
      }),
      transformResponse: <T>(result: HttpSuccess<ApiResult<T>>) => of(result.data),
    };
    const client = useFactory
      ? factory.create(() => of({ baseUrl: "/api" }), options)
      : factory.configure(options);

    const user = await firstValueFrom(client.get<UserVO>("/user"));
    expectTypeOf(user).toEqualTypeOf<ApiResult<UserVO>>();
    expect(user.data).toEqual({ id: 1, name: "Ada" });
    token = "second-token";
    const login = await firstValueFrom(
      client.post<LoginVO, LoginDTO>("/login", { username: "Ada" }),
    );
    expectTypeOf(login).toEqualTypeOf<ApiResult<LoginVO>>();
    expect(login.data?.token).toBe("new-token");
    expect(context.configs[1]?.data).toBe(JSON.stringify({ username: "Ada" }));
    expect(context.configs.map((config) => config.headers.get("Authorization"))).toEqual([
      "Bearer first-token",
      "Bearer second-token",
    ]);

    const failure = await firstValueFrom(client.get<UserVO>("/unavailable"));
    expectTypeOf(failure).toEqualTypeOf<ApiResult<UserVO>>();
    expect(failure).toMatchObject({ code: 503, data: null, request_id: "failed-request" });
    expect(context.calls).toBe(3);
  });
});
