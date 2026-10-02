import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type { HttpHeadersTransform } from "../../internal/http/headers.js";

/** Promise HTTP 请求允许使用的方法。 */
export type PromiseHttpMethod =
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

/** Promise HTTP 客户端的最终配置；工厂和构造选项都可以只提供部分字段。 */
export interface PromiseHttpClientConfig {
  /** 基础 URL；绝对 URL 请求不会拼接该值。 */
  baseUrl: string;
  /** 一次请求允许的总尝试次数，`1` 表示不重试，最大为 100。 */
  retryCount: number;
  /** 每次重试前等待的毫秒数，最大为 2_147_483_647。 */
  retryDelay: number;
  /** Axios 超时时间，最大为 2_147_483_647。 */
  timeout?: number;
  /** 是否启用同一时刻的请求去重。 */
  dedupe: boolean;
  /** 是否启用请求级重试。 */
  retryable: boolean;
  /** 是否允许非幂等方法重试，默认为 false。 */
  retryNonIdempotent: boolean;
}

/** Promise HTTP 客户端构造选项；axiosInstance 允许注入调用方配置好的 Axios 实例。 */
export interface PromiseHttpClientOptions<
  F extends PromiseHttpResponseTransformer | undefined = PromiseHttpResponseTransformer | undefined,
> extends Partial<PromiseHttpClientConfig> {
  axiosInstance?: AxiosInstance;
  /** 每次请求时同步处理请求头副本；请求级 headers 始终优先，字段名不区分大小写。 */
  transformHeaders?: HttpHeadersTransform;
  /** 处理统一成功结果，可返回 Promise；在网络重试之外执行，返回类型自动推导。 */
  transformResponse?: F;
}

/**
 * 成功结果处理函数；未标注响应体类型时 data 为 unknown。
 * 使用方法签名允许调用方声明具体响应体，与请求泛型一样，由调用方负责保证数据结构。
 */
export type PromiseHttpResponseTransformer = {
  transform(response: PromiseHttpSuccess<unknown>): unknown;
}["transform"];

type TransformedResponse<T, F> = F extends (...args: never[]) => infer R
  ? Awaited<R>
  : PromiseHttpSuccess<T>;

/** 按实际选项推导结果；处理函数可能缺省时保留原成功结果的联合类型。 */
export type PromiseHttpResponseResult<T, O> = O extends { transformResponse: infer F }
  ? TransformedResponse<T, F>
  : O extends { transformResponse?: infer F }
    ? TransformedResponse<T, F | undefined>
    : PromiseHttpSuccess<T>;

/** 延迟获取客户端配置的工厂；工厂可以同步返回配置，也可以返回 Promise。 */
export type PromiseHttpConfigFactory = () =>
  | Partial<PromiseHttpClientConfig>
  | Promise<Partial<PromiseHttpClientConfig>>;

/** 单个请求可以覆盖的客户端配置以及 Axios 常用请求字段。 */
export interface PromiseHttpRequestOptions {
  params?: AxiosRequestConfig["params"];
  headers?: AxiosRequestConfig["headers"];
  /** Axios 超时时间，最大为 2_147_483_647。 */
  timeout?: number;
  /** 一次请求允许的总尝试次数，最大为 100。 */
  retryCount?: number;
  /** 每次重试前等待的毫秒数，最大为 2_147_483_647。 */
  retryDelay?: number;
  retryable?: boolean;
  /** 是否允许非幂等方法重试，默认为 false。 */
  retryNonIdempotent?: boolean;
  dedupe?: boolean;
  /** 非 JSON 请求体或其他无法稳定序列化的参数需要使用显式 key。 */
  dedupeKey?: string;
  /** 既可取消 Axios 请求，也可取消配置和重试等待阶段。 */
  signal?: AxiosRequestConfig["signal"];
}

/** 完整请求配置。调用 request/get 等方法时即开始执行，不提供 Observable 式懒执行。 */
export interface PromiseHttpRequestConfig<D = unknown> extends PromiseHttpRequestOptions {
  url: string;
  method: PromiseHttpMethod;
  data?: D;
}

/** 统一的 Promise HTTP 成功结果；code 始终是 HTTP 状态码。 */
export interface PromiseHttpSuccess<T> {
  code: number;
  success: true;
  data: T;
  error: null;
}

/** 统一的 Promise HTTP 失败结果结构。请求失败时通过 Promise rejection 返回其错误实例。 */
export interface PromiseHttpFailure {
  code: number;
  success: false;
  data: null;
  error: PromiseHttpErrorInfo;
}

export type PromiseHttpResult<T> = PromiseHttpSuccess<T> | PromiseHttpFailure;

/** Promise HTTP 错误分类。 */
export type PromiseHttpErrorKind = "config" | "http" | "network" | "timeout" | "cancel" | "unknown";

/** 统一错误详情；cause 保留 Axios、配置工厂或其他原始错误。 */
export interface PromiseHttpErrorInfo {
  kind: PromiseHttpErrorKind;
  message: string;
  cause: unknown;
}

export interface ResolvedRequest<D> {
  method: PromiseHttpMethod;
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
  dedupeKey?: string;
  signal?: AxiosRequestConfig["signal"];
}
