import type {
  AxiosHeaderValue,
  AxiosInstance,
  AxiosRequestConfig,
  RawAxiosRequestHeaders,
} from "axios";
import type { Observable } from "rxjs";
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
  F extends HttpResponseTransformer<C> | undefined = HttpResponseTransformer | undefined,
  E extends HttpErrorTransformer<C> | undefined = undefined,
  C = unknown,
> extends Partial<HttpClientConfig> {
  /** Axios 传输实例；省略时使用默认实例。 */
  axiosInstance?: AxiosInstance;
  /** 每次订阅开始时同步创建业务上下文；早于配置等待，保留原引用，内部重试不重复调用。 */
  createContext?: () => C;
  /** 每次订阅时同步处理请求头副本；请求级 headers 始终优先，字段名不区分大小写。 */
  transformHeaders?: (
    headers: RawAxiosRequestHeaders,
    request: HttpRequestContext<C>,
  ) => RawAxiosRequestHeaders;
  /** 处理统一成功结果，支持普通值、Promise 或 Observable；展开异步结果并自动推导发值类型。 */
  transformResponse?: F;
  /** 在最终失败后转换为普通结果；回调自身失败不重试、不再次进入该回调。 */
  transformError?: E;
}

/**
 * 成功结果处理函数；未标注响应体类型时 data 为 unknown。
 * 方法签名允许调用方声明具体响应体，与请求泛型一样，由调用方负责保证数据结构。
 * 交叉的函数签名单独约束上下文，避免方法双变放行比工厂返回值更窄的 C；never 不限制响应体。
 */
export type HttpResponseTransformer<C = unknown> = {
  transform(response: HttpSuccess<unknown>, request: HttpRequestContext<C>): unknown;
}["transform"] &
  ((response: never, request: HttpRequestContext<C>) => unknown);

/** 取得统一请求错误及其 HTTP 状态、分类和原始 cause，返回普通值或异步结果。 */
export type HttpErrorTransformer<C = unknown> = (
  error: HttpRequestError,
  request: HttpRequestContext<C>,
) => unknown;

/** 已规范化的请求头快照；字段及多值数组均只读，显式屏蔽值保持原样。 */
export type HttpRequestHeaders = Readonly<
  Record<string, AxiosHeaderValue | readonly string[] | undefined>
>;

/** 当前订阅的转换信息；不进入网络配置或去重身份，业务对象由使用方管理。 */
export interface HttpRequestContext<C = unknown> {
  /** createContext 的原始返回值；未配置或创建失败时为 undefined。 */
  readonly context: C | undefined;
  /** 最终请求头快照；收到 Axios 结果时采用其实际 config.headers，否则采用库已解析的头。初始化或 Header 转换未完成时为 undefined。 */
  readonly headers: HttpRequestHeaders | undefined;
}

/** 客户端推断时允许两种回调；HttpClientOptions<F> 的旧用法仍表示没有错误转换。 */
export type AnyHttpClientOptions<C = unknown> = HttpClientOptions<
  HttpResponseTransformer<C> | undefined,
  HttpErrorTransformer<C> | undefined,
  C
>;

/**
 * 单次请求泛型的显式映射。使用方继承该接口，通过 this["data"] 定义其余字段。
 * data 是 get<T>/post<T,D> 的 T；body 为原响应体，result/error 为转换后的发值类型。
 */
export interface HttpResponseTypeMap {
  /** 当前请求指定的载荷 T，用 this["data"] 关联下方三个类型。 */
  readonly data: unknown;
  /** 未经业务转换的服务端响应体。 */
  readonly body: unknown;
  /** 成功转换最终发出的值。 */
  readonly result: unknown;
  /** 错误转换恢复后最终发出的值。 */
  readonly error: unknown;
}

/** 把当前请求的 T 注入使用方声明的映射。 */
type MappedTypes<M extends HttpResponseTypeMap, T> = M & { readonly data: T };

/** 剔除会被转换流水线展开的容器，避免误将业务容器当成普通值。 */
type PlainValue<T> = T extends Observable<unknown> | PromiseLike<unknown> ? never : T;

/** 若业务值本身是异步容器，需用 Observable 包住它，避免被误当作待展开的转换结果。 */
export type HttpTransformValue<T> =
  | PlainValue<T>
  | Observable<T>
  | PromiseLike<PlainValue<T> | Observable<T>>;

/** 映射模式下，两个回调必须对任意请求 T 遵守使用方声明的输入和输出关系。 */
export interface HttpMappedClientOptions<M extends HttpResponseTypeMap, C = unknown>
  extends Omit<AnyHttpClientOptions<C>, "transformResponse" | "transformError"> {
  /** 对每次请求的响应体执行映射，并读取当前订阅的上下文和最终请求头。 */
  transformResponse?: <T>(
    response: HttpSuccess<MappedTypes<M, T>["body"]>,
    request: HttpRequestContext<C>,
  ) => HttpTransformValue<MappedTypes<M, T>["result"]>;
  /** 最终失败的业务转换；初始化未完成时上下文或请求头可能缺失。 */
  transformError?: <T>(
    error: HttpRequestError,
    request: HttpRequestContext<C>,
  ) => HttpTransformValue<MappedTypes<M, T>["error"]>;
}

/** 选择普通或映射模式的回调契约；C 只决定订阅上下文，不改变请求 T/D。 */
export type HttpClientOptionsFor<
  M extends HttpResponseTypeMap | undefined,
  C = unknown,
> = M extends HttpResponseTypeMap ? HttpMappedClientOptions<M, C> : AnyHttpClientOptions<C>;

/** 单独从工厂推导 C，防止转换回调的参数反向扩大上下文类型。 */
export type HttpClientOptionsInput<
  M extends HttpResponseTypeMap | undefined,
  C,
> = HttpClientOptionsFor<M, NoInfer<C>> & {
  /** 独立推导点；不执行、不等待返回值，仅声明同步创建的上下文类型。 */
  createContext?: () => C;
};

/** 取得当前请求在映射模式下的原始响应体；普通模式沿用 T。 */
export type HttpResponseBody<
  T,
  M extends HttpResponseTypeMap | undefined,
> = M extends HttpResponseTypeMap ? MappedTypes<M, T>["body"] : T;

/** 只展开处理函数返回的流，流内部的值保持其原类型。 */
type ObservableValue<R> = R extends Observable<infer V> ? V : R;

/** 未配置成功转换时仍返回统一成功结构。 */
type UntransformedResponse<
  T,
  M extends HttpResponseTypeMap | undefined,
> = M extends HttpResponseTypeMap ? HttpSuccess<MappedTypes<M, T>["body"]> : HttpSuccess<T>;

/** 普通模式解开返回容器，映射模式采用已约束的 result 关系。 */
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

/** 仅在选项可能包含错误转换时增加恢复结果类型。 */
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
  /** Axios 查询参数；由其 params 序列化规则处理。 */
  params?: AxiosRequestConfig["params"];
  /** 显式请求头，可包含 common/方法分组；最终覆盖默认值与回调结果。 */
  headers?: AxiosRequestConfig["headers"];
  /** 单次 Axios 尝试的超时毫秒数，省略时继承客户端配置。 */
  timeout?: number;
  /** 包含首次请求的最大尝试次数，省略时继承客户端配置。 */
  retryCount?: number;
  /** 重试前等待的毫秒数，省略时继承客户端配置。 */
  retryDelay?: number;
  /** 是否允许请求级重试，省略时继承客户端配置。 */
  retryable?: boolean;
  /** 是否允许可能重复产生副作用的 HTTP 方法重试，默认为 false。 */
  retryNonIdempotent?: boolean;
  /** 是否共享相同身份的进行中请求，省略时继承客户端配置。 */
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
  /** 相对或绝对 URL，相对路径使用客户端 baseUrl。 */
  url: string;
  /** 支持的 HTTP 方法，发送前转为统一大小写。 */
  method: HttpMethod;
  /** 请求体，省略时不向 Axios 传递 data。 */
  data?: D;
}

/** 统一的成功结果；`code` 始终是 HTTP 状态码，不读取后端响应体中的业务 code。 */
export interface HttpSuccess<T> {
  /** HTTP 状态码，与业务响应体中的 code 无关。 */
  code: number;
  /** 成功分支的判别字段。 */
  success: true;
  /** Axios 解码后的响应体；泛型不代表运行时校验。 */
  data: T;
  /** 成功时不存在统一错误信息。 */
  error: null;
}

/** 统一的失败结果结构；失败时通过 Observable.error 发出其对应的 HttpRequestError。 */
export interface HttpFailure {
  /** HTTP 状态码；未收到 HTTP 响应时为 0。 */
  code: number;
  /** 失败分支的判别字段。 */
  success: false;
  /** 失败分支无成功载荷，原始响应可从 cause 获取。 */
  data: null;
  /** 请求失败的分类与原始原因。 */
  error: HttpErrorInfo;
}

/** 成功或失败的统一结果类型。请求方法默认只在成功通道发出 HttpSuccess。 */
export type HttpResult<T> = HttpSuccess<T> | HttpFailure;

/** HTTP 请求错误的分类。 */
export type HttpErrorKind = "config" | "http" | "network" | "timeout" | "cancel" | "unknown";

/** 统一错误详情；cause 保留 Axios 或配置工厂的原始错误。 */
export interface HttpErrorInfo {
  /** 配置、HTTP、网络、超时、取消或未知错误分类。 */
  kind: HttpErrorKind;
  /** 统一后的错误说明。 */
  message: string;
  /** 未经丢弃的底层异常或使用方抛出的值。 */
  cause: unknown;
}

/** 配置合并和校验后的单次传输输入，不包含订阅业务上下文。 */
export interface ResolvedRequest<D> {
  /** 规范化的 HTTP 方法。 */
  method: HttpMethod;
  /** 已结合 baseUrl 解析的 URL。 */
  url: string;
  /** 可选的请求体引用。 */
  data?: D;
  /** 可选的查询参数引用。 */
  params?: AxiosRequestConfig["params"];
  /** Header 转换完成后保存的规范化请求头。 */
  headers?: AxiosRequestConfig["headers"];
  /** 单次网络尝试超时毫秒数；省略时沿用 Axios 默认值。 */
  timeout?: number;
  /** 包含首次请求的最大尝试次数。 */
  retryCount: number;
  /** 重试间隔毫秒数。 */
  retryDelay: number;
  /** 是否启用请求级重试。 */
  retryable: boolean;
  /** 是否允许有副作用的方法重试。 */
  retryNonIdempotent: boolean;
  /** 是否启用进行中请求的身份去重。 */
  dedupe: boolean;
  /** 最后一个订阅者离开时是否中止传输。 */
  cancelOnNoSubscribers: boolean;
  /** 使用方声明的请求身份，省略时尝试自动序列化。 */
  dedupeKey?: string;
  /** 调用方显式取消信号；存在时不共享网络请求。 */
  signal?: AxiosRequestConfig["signal"];
}
