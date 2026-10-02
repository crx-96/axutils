import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type { Observable } from "rxjs";
import type { HttpHeadersTransform } from "../../internal/http/headers.js";
import type { HttpRequestError } from "./errors.js";

/** HTTP 请求允许使用的方法。 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "head"
  | "options";

/** HTTP 客户端的最终配置；工厂和构造函数选项均可只提供其中一部分。 */
export interface HttpClientConfig {
  /** 基础 URL；绝对 URL 请求不会拼接该值。 */
  baseUrl: string;
  /** 一次请求允许的总尝试次数，`1` 表示不重试。 */
  retryCount: number;
  /** 每次重试前等待的毫秒数。 */
  retryDelay: number;
  /** Axios 超时时间；未设置时沿用 Axios 默认值。 */
  timeout?: number;
  /** 是否启用同一时刻的请求去重。 */
  dedupe: boolean;
  /** 是否启用请求级重试。 */
  retryable: boolean;
  /** 是否允许 POST、PUT、PATCH、DELETE 等可能重复产生副作用的方法重试，默认为 false。 */
  retryNonIdempotent: boolean;
  /** 最后一个订阅者取消时是否中止底层 Axios 请求，默认为 false。 */
  cancelOnNoSubscribers: boolean;
}

/**
 * 客户端构造选项。
 *
 * `axiosInstance` 可注入浏览器、Node.js 或 Nuxt 使用方配置好的 Axios 实例；不传时使用 Axios 默认实例。
 * 使用本模块需要按需安装 `rxjs`、`axios`、`safe-stable-stringify` 和 `spark-md5`，安装命令见包 README。
 */
export interface HttpClientOptions<
  F extends HttpResponseTransformer | undefined = HttpResponseTransformer | undefined,
  E extends HttpErrorTransformer | undefined = undefined,
> extends Partial<HttpClientConfig> {
  axiosInstance?: AxiosInstance;
  /** 每次订阅时同步处理请求头副本；请求级 headers 始终优先，字段名不区分大小写。 */
  transformHeaders?: HttpHeadersTransform;
  /** 处理统一成功结果，支持普通值、Promise 或 Observable；展开异步结果并自动推导发值类型。 */
  transformResponse?: F;
  /** 在最终失败后转换为普通结果；回调自身失败不重试、不再次进入该回调。 */
  transformError?: E;
}

/**
 * 成功结果处理函数；未标注响应体类型时 data 为 unknown。
 * 使用方法签名允许调用方声明具体响应体，与请求泛型一样，由调用方负责保证数据结构。
 */
export type HttpResponseTransformer = {
  transform(response: HttpSuccess<unknown>): unknown;
}["transform"];

/** 取得统一请求错误及其 HTTP 状态、分类和原始 cause，返回普通值或异步结果。 */
export type HttpErrorTransformer = (error: HttpRequestError) => unknown;

/** 客户端推断时允许两种回调；HttpClientOptions<F> 的旧用法仍表示没有错误转换。 */
export type AnyHttpClientOptions = HttpClientOptions<
  HttpResponseTransformer | undefined,
  HttpErrorTransformer | undefined
>;

/**
 * 单次请求泛型的显式映射。使用方继承该接口，通过 this["data"] 定义其余字段。
 * data 是 get<T>/post<T,D> 的 T；body 为原响应体，result/error 为转换后的发值类型。
 */
export interface HttpResponseTypeMap {
  readonly data: unknown;
  readonly body: unknown;
  readonly result: unknown;
  readonly error: unknown;
}

type MappedTypes<M extends HttpResponseTypeMap, T> = M & { readonly data: T };

type PlainValue<T> = T extends Observable<unknown> | PromiseLike<unknown> ? never : T;

/** 若业务值本身是异步容器，需用 Observable 包住它，避免被误当作待展开的转换结果。 */
export type HttpTransformValue<T> =
  | PlainValue<T>
  | Observable<T>
  | PromiseLike<PlainValue<T> | Observable<T>>;

/** 映射模式下，两个回调必须对任意请求 T 遵守使用方声明的输入和输出关系。 */
export interface HttpMappedClientOptions<M extends HttpResponseTypeMap>
  extends Omit<AnyHttpClientOptions, "transformResponse" | "transformError"> {
  transformResponse?: <T>(
    response: HttpSuccess<MappedTypes<M, T>["body"]>,
  ) => HttpTransformValue<MappedTypes<M, T>["result"]>;
  transformError?: <T>(error: HttpRequestError) => HttpTransformValue<MappedTypes<M, T>["error"]>;
}

export type HttpClientOptionsFor<M extends HttpResponseTypeMap | undefined> =
  M extends HttpResponseTypeMap ? HttpMappedClientOptions<M> : AnyHttpClientOptions;

export type HttpResponseBody<
  T,
  M extends HttpResponseTypeMap | undefined,
> = M extends HttpResponseTypeMap ? MappedTypes<M, T>["body"] : T;

/** 只展开处理函数返回的流，流内部的值保持其原类型。 */
type ObservableValue<R> = R extends Observable<infer V> ? V : R;

type UntransformedResponse<
  T,
  M extends HttpResponseTypeMap | undefined,
> = M extends HttpResponseTypeMap ? HttpSuccess<MappedTypes<M, T>["body"]> : HttpSuccess<T>;

type TransformedResponse<T, F, M extends HttpResponseTypeMap | undefined> = F extends (
  ...args: never[]
) => infer R
  ? M extends HttpResponseTypeMap
    ? MappedTypes<M, T>["result"]
    : ObservableValue<Awaited<R>>
  : UntransformedResponse<T, M>;

/** 按实际选项推导结果；处理函数可能缺省时保留原成功结果的联合类型。 */
type SuccessResponse<T, O, M extends HttpResponseTypeMap | undefined> = O extends {
  transformResponse: infer F;
}
  ? TransformedResponse<T, F, M>
  : O extends { transformResponse?: infer F }
    ? TransformedResponse<T, F | undefined, M>
    : UntransformedResponse<T, M>;

type ErrorResponse<T, O, M extends HttpResponseTypeMap | undefined> = O extends {
  transformError?: infer E;
}
  ? E extends (...args: never[]) => infer R
    ? M extends HttpResponseTypeMap
      ? MappedTypes<M, T>["error"]
      : ObservableValue<Awaited<R>>
    : never
  : never;

/** 成功与错误转换共同决定最终发值类型；未配置错误转换时不增加结果分支。 */
export type HttpResponseResult<T, O, M extends HttpResponseTypeMap | undefined = undefined> =
  | SuccessResponse<T, O, M>
  | ErrorResponse<T, O, M>;

/** 延迟获取客户端配置的 RxJS 工厂。工厂只会在第一次请求订阅时执行。 */
export type HttpConfigFactory = () => Observable<Partial<HttpClientConfig>>;

/** 单个请求可以覆盖的客户端配置以及 Axios 常用请求字段。 */
export interface HttpRequestOptions {
  params?: AxiosRequestConfig["params"];
  headers?: AxiosRequestConfig["headers"];
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  retryable?: boolean;
  /** 是否允许可能重复产生副作用的 HTTP 方法重试，默认为 false。 */
  retryNonIdempotent?: boolean;
  dedupe?: boolean;
  /** 最后一个订阅者取消时是否中止底层请求，默认为 false。 */
  cancelOnNoSubscribers?: boolean;
  /** 非 JSON 请求体或其他无法稳定序列化的参数需要用显式 key 才能去重。 */
  dedupeKey?: string;
  /** 支持 Axios 的 AbortController 信号；除网络请求外，也可取消异步配置和 retryDelay 等等待阶段。 */
  signal?: AxiosRequestConfig["signal"];
}

/** 完整请求配置。请求方法返回的 Observable 直到订阅时才会真正触发配置和网络请求。 */
export interface HttpRequestConfig<D = unknown> extends HttpRequestOptions {
  url: string;
  method: HttpMethod;
  data?: D;
}

/** 统一的成功结果；`code` 始终是 HTTP 状态码，不读取后端响应体中的业务 code。 */
export interface HttpSuccess<T> {
  code: number;
  success: true;
  data: T;
  error: null;
}

/** 统一的失败结果结构；失败时通过 Observable.error 发出其对应的 HttpRequestError。 */
export interface HttpFailure {
  code: number;
  success: false;
  data: null;
  error: HttpErrorInfo;
}

/** 成功或失败的统一结果类型。请求方法默认只在成功通道发出 HttpSuccess。 */
export type HttpResult<T> = HttpSuccess<T> | HttpFailure;

/** HTTP 请求错误的分类。 */
export type HttpErrorKind = "config" | "http" | "network" | "timeout" | "cancel" | "unknown";

/** 统一错误详情；cause 保留 Axios 或配置工厂的原始错误。 */
export interface HttpErrorInfo {
  kind: HttpErrorKind;
  message: string;
  cause: unknown;
}

export interface ResolvedRequest<D> {
  method: HttpMethod;
  url: string;
  data?: D;
  params?: AxiosRequestConfig["params"];
  headers?: AxiosRequestConfig["headers"];
  timeout?: number;
  retryCount: number;
  retryDelay: number;
  retryable: boolean;
  retryNonIdempotent: boolean;
  dedupe: boolean;
  cancelOnNoSubscribers: boolean;
  dedupeKey?: string;
  signal?: AxiosRequestConfig["signal"];
}
