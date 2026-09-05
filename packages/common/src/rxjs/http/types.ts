import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type { Observable } from "rxjs";

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
export interface HttpClientOptions extends Partial<HttpClientConfig> {
  axiosInstance?: AxiosInstance;
}

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
