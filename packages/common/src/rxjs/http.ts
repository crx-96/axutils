import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  isAxiosError,
  isCancel,
} from "axios";
import {
  catchError,
  defer,
  finalize,
  first,
  from,
  map,
  Observable,
  of,
  race,
  retry,
  shareReplay,
  switchMap,
  tap,
  throwError,
  timer,
} from "rxjs";

import { Md5 } from "../crypto/md5.js";
import { jsonStringify } from "../object/json.js";

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

/**
 * 请求最终失败时发出的错误实例。
 *
 * 除了继承 Error 便于 RxJS/Promise 生态识别，还直接暴露统一失败结果中的 code、success、data、error 字段，
 * 调用方可以使用 `instanceof HttpRequestError` 区分本客户端错误与其他 Observable 错误。
 */
export class HttpRequestError extends Error implements HttpFailure {
  declare readonly code: number;
  declare readonly success: false;
  declare readonly data: null;
  declare readonly error: HttpErrorInfo;

  constructor(code: number, error: HttpErrorInfo) {
    super(error.message);
    this.name = "HttpRequestError";
    this.code = code;
    this.success = false;
    this.data = null;
    this.error = error;
    // ES2020 下 Error 子类在部分运行时需要显式修复原型链，保证 instanceof 稳定。
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const DEFAULT_CONFIG: HttpClientConfig = {
  baseUrl: "",
  retryCount: 3,
  retryDelay: 0,
  dedupe: true,
  retryable: true,
  retryNonIdempotent: false,
  cancelOnNoSubscribers: false,
};

const HTTP_METHODS = new Set<HttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

// 这些方法通常不会因为重复执行而再次创建业务副作用，默认允许按网络错误规则重试。
const SAFE_RETRY_METHODS = new Set<HttpMethod>(["GET", "HEAD", "OPTIONS"]);

const CONFIG_ERROR_CODES = new Set([
  "ERR_BAD_OPTION",
  "ERR_BAD_OPTION_VALUE",
  "ERR_DEPRECATED",
  "ERR_INVALID_URL",
  "ERR_NOT_SUPPORT",
]);

interface ResolvedRequest<D> {
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

/** 只提取同步配置，避免把 Axios 实例意外合并进异步配置对象。 */
const getConfigOptions = (options: HttpClientOptions): Partial<HttpClientConfig> => {
  const config: Partial<HttpClientConfig> = {};
  if (options.baseUrl !== undefined) config.baseUrl = options.baseUrl;
  if (options.retryCount !== undefined) config.retryCount = options.retryCount;
  if (options.retryDelay !== undefined) config.retryDelay = options.retryDelay;
  if (options.timeout !== undefined) config.timeout = options.timeout;
  if (options.dedupe !== undefined) config.dedupe = options.dedupe;
  if (options.retryable !== undefined) config.retryable = options.retryable;
  if (options.retryNonIdempotent !== undefined) {
    config.retryNonIdempotent = options.retryNonIdempotent;
  }
  if (options.cancelOnNoSubscribers !== undefined) {
    config.cancelOnNoSubscribers = options.cancelOnNoSubscribers;
  }
  return config;
};

/**
 * 校验配置工厂返回的值确实是普通对象。
 *
 * `typeof null` 也是 `object`，数组也可能意外通过宽泛的对象判断；两者都不能作为配置合并源，
 * 因此这里必须显式排除，避免后续展开或字段读取把运行时错误推迟到更难定位的位置。
 */
function assertObject(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(message);
  }
}

const normalizeRequestOptions = (options: HttpRequestOptions | undefined): HttpRequestOptions => {
  if (options === undefined) return {};
  assertObject(options, "HttpRequestOptions 必须是对象");
  return options;
};

const validateSignal = (signal: unknown): void => {
  if (signal === undefined) return;
  if (
    typeof signal !== "object" ||
    signal === null ||
    typeof (signal as { aborted?: unknown }).aborted !== "boolean"
  ) {
    throw new TypeError("signal 必须是 AbortSignal");
  }
};

const normalizePositiveInteger = (value: unknown, fallback: number, name: string): number => {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "number" || !Number.isInteger(result) || result < 1) {
    throw new TypeError(`${name} 必须是大于等于 1 的整数`);
  }
  return result;
};

const normalizeNonNegativeNumber = (value: unknown, fallback: number, name: string): number => {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "number" || !Number.isFinite(result) || result < 0) {
    throw new TypeError(`${name} 必须是大于等于 0 的有限数字`);
  }
  return result;
};

const normalizeOptionalTimeout = (value: unknown, name: string): number | undefined => {
  if (value === undefined) return undefined;
  return normalizeNonNegativeNumber(value, 0, name);
};

const normalizeConfig = (config: Partial<HttpClientConfig>): HttpClientConfig => {
  const baseUrl = config.baseUrl === undefined ? DEFAULT_CONFIG.baseUrl : config.baseUrl;
  if (typeof baseUrl !== "string") {
    throw new TypeError("baseUrl 必须是字符串");
  }

  const dedupe = config.dedupe === undefined ? DEFAULT_CONFIG.dedupe : config.dedupe;
  if (typeof dedupe !== "boolean") {
    throw new TypeError("dedupe 必须是布尔值");
  }

  const retryable = config.retryable === undefined ? DEFAULT_CONFIG.retryable : config.retryable;
  if (typeof retryable !== "boolean") {
    throw new TypeError("retryable 必须是布尔值");
  }

  const retryNonIdempotent =
    config.retryNonIdempotent === undefined
      ? DEFAULT_CONFIG.retryNonIdempotent
      : config.retryNonIdempotent;
  if (typeof retryNonIdempotent !== "boolean") {
    throw new TypeError("retryNonIdempotent 必须是布尔值");
  }

  const cancelOnNoSubscribers =
    config.cancelOnNoSubscribers === undefined
      ? DEFAULT_CONFIG.cancelOnNoSubscribers
      : config.cancelOnNoSubscribers;
  if (typeof cancelOnNoSubscribers !== "boolean") {
    throw new TypeError("cancelOnNoSubscribers 必须是布尔值");
  }

  const result: HttpClientConfig = {
    baseUrl,
    retryCount: normalizePositiveInteger(
      config.retryCount,
      DEFAULT_CONFIG.retryCount,
      "retryCount",
    ),
    retryDelay: normalizeNonNegativeNumber(
      config.retryDelay,
      DEFAULT_CONFIG.retryDelay,
      "retryDelay",
    ),
    dedupe,
    retryable,
    retryNonIdempotent,
    cancelOnNoSubscribers,
  };
  const timeout = normalizeOptionalTimeout(config.timeout, "timeout");
  if (timeout !== undefined) result.timeout = timeout;
  return result;
};

const normalizeMethod = (method: string): HttpMethod => {
  const normalized = method.toUpperCase() as HttpMethod;
  if (!HTTP_METHODS.has(normalized)) {
    throw new TypeError(`不支持的 HTTP method：${method}`);
  }
  return normalized;
};

/** Axios 的 baseURL 拼接规则的轻量等价实现，用于发送请求和生成稳定去重 key。 */
const resolveUrl = (baseUrl: string, url: string): string => {
  // 与 Axios isAbsoluteURL 一致：协议 URL 和以 // 开头的协议相对 URL 不拼接 baseUrl。
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//iu.test(url) || baseUrl === "") {
    return url;
  }
  if (url === "") return baseUrl;
  return `${baseUrl.replace(/\/+$/u, "")}/${url.replace(/^\/+/u, "")}`;
};

/**
 * 判断值是否属于可以安全用于自动去重的 JSON 子集。
 *
 * Map、Set、FormData、流、类实例和循环引用都刻意排除；这些对象即使能被某些 JSON 实现转成字符串，
 * 也可能丢失实际请求语义。调用方可通过 dedupeKey 显式声明它们的去重身份。
 */
const isStableJsonValue = (value: unknown, ancestors = new WeakSet<object>()): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;

  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.every((item) => isStableJsonValue(item, ancestors));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;

    return Object.keys(value).every((key) =>
      isStableJsonValue((value as Record<string, unknown>)[key], ancestors),
    );
  } finally {
    ancestors.delete(value);
  }
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return String(error);
  } catch {
    return "HTTP 请求失败";
  }
};

const getResponseStatus = (error: unknown): number | undefined => {
  if (isAxiosError(error) && error.response !== undefined) {
    return error.response.status;
  }
  return undefined;
};

const isTimeoutError = (error: unknown): boolean => {
  if (!isAxiosError(error)) return false;
  return (
    error.code === AxiosError.ETIMEDOUT ||
    error.code === AxiosError.ECONNABORTED ||
    /timeout/iu.test(error.message)
  );
};

const isCancellationError = (error: unknown): boolean => {
  return isCancel(error) || (isAxiosError(error) && error.code === AxiosError.ERR_CANCELED);
};

/** 仅允许网络、超时、429 和 5xx 进入重试，4xx 与取消/配置错误均立即结束。 */
const isRetryableError = (error: unknown): boolean => {
  if (isCancellationError(error)) return false;
  const status = getResponseStatus(error);
  if (status !== undefined) return status === 429 || status >= 500;
  if (isTimeoutError(error)) return true;
  if (isAxiosError(error)) {
    if (error.code !== undefined && CONFIG_ERROR_CODES.has(error.code)) return false;
    return true;
  }
  // Axios 自定义 adapter 可能直接抛出 Error，此类无响应错误视为网络错误。
  return error instanceof Error;
};

const classifyError = (error: unknown): HttpErrorKind => {
  if (isCancellationError(error)) return "cancel";
  if (getResponseStatus(error) !== undefined) return "http";
  if (isTimeoutError(error)) return "timeout";
  if (isAxiosError(error)) {
    if (error.code !== undefined && CONFIG_ERROR_CODES.has(error.code)) return "config";
    return "network";
  }
  if (error instanceof Error) return "network";
  return "unknown";
};

const toHttpRequestError = (error: unknown, forcedKind?: HttpErrorKind): HttpRequestError => {
  if (error instanceof HttpRequestError && forcedKind === undefined) return error;
  const kind = forcedKind ?? classifyError(error);
  const status = forcedKind === "config" ? 0 : (getResponseStatus(error) ?? 0);
  return new HttpRequestError(status, {
    kind,
    message: getErrorMessage(error),
    cause: error,
  });
};

interface AbortControllerLike {
  signal: NonNullable<AxiosRequestConfig["signal"]>;
  abort(): void;
}

interface AbortLifecycle {
  signal: AxiosRequestConfig["signal"];
  abort(): void;
  cleanup(): void;
}

type AbortControllerConstructor = new () => AbortControllerLike;

/**
 * 通过 globalThis 读取 AbortController，避免在不提供该全局对象的旧运行时中模块加载失败。
 * 目标运行时通常都支持它；如果运行时没有实现，则保留原有 signal 行为，但无法提供自动取消。
 */
const getAbortController = (): AbortControllerLike | undefined => {
  const AbortControllerClass = (
    globalThis as unknown as {
      AbortController?: AbortControllerConstructor;
    }
  ).AbortController;
  return AbortControllerClass === undefined ? undefined : new AbortControllerClass();
};

/**
 * 为一次 Axios 请求创建取消生命周期。
 * 当启用自动取消时，内部 controller 负责“最后一个订阅者离开”的取消；用户传入的 signal
 * 会通过事件转发到同一个 controller，从而同时支持显式 abort 和 RxJS 订阅取消。
 */
const createAbortLifecycle = (
  sourceSignal: AxiosRequestConfig["signal"],
  enabled: boolean,
): AbortLifecycle => {
  if (!enabled) {
    return {
      signal: sourceSignal,
      abort: () => undefined,
      cleanup: () => undefined,
    };
  }

  const controller = getAbortController();
  if (controller === undefined) {
    return {
      signal: sourceSignal,
      abort: () => undefined,
      cleanup: () => undefined,
    };
  }

  if (sourceSignal === undefined) {
    return {
      signal: controller.signal,
      abort: () => controller.abort(),
      cleanup: () => undefined,
    };
  }

  if (sourceSignal.aborted) {
    controller.abort();
    return {
      signal: controller.signal,
      abort: () => controller.abort(),
      cleanup: () => undefined,
    };
  }

  if (typeof sourceSignal.addEventListener !== "function") {
    // Axios 的标准 AbortSignal 都支持 addEventListener；不完整的自定义 signal 无法安全合并。
    return {
      signal: sourceSignal,
      abort: () => undefined,
      cleanup: () => undefined,
    };
  }

  const onAbort = () => controller.abort();
  sourceSignal.addEventListener("abort", onAbort);
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    cleanup: () => sourceSignal.removeEventListener?.("abort", onAbort),
  };
};

/**
 * 将调用方的 AbortSignal 连接到请求的完整 RxJS 生命周期。
 * Axios 只能中止已经发出的网络请求；这里额外监听 signal，使异步配置和 retryDelay 等等待阶段也能立即终止。
 */
const createCallerAbort$ = (
  sourceSignal: AxiosRequestConfig["signal"],
): Observable<never> | undefined => {
  if (sourceSignal === undefined) return undefined;

  const createCancellationError = () => new AxiosError("canceled", AxiosError.ERR_CANCELED);
  return new Observable<never>((subscriber) => {
    // Observable 可能在 signal 创建后才订阅；必须在订阅时再次检查，避免错过已经发生的 abort 事件。
    if (sourceSignal.aborted) {
      subscriber.error(createCancellationError());
      return;
    }
    if (typeof sourceSignal.addEventListener !== "function") return;

    const onAbort = () => subscriber.error(createCancellationError());
    sourceSignal.addEventListener("abort", onAbort);
    // 处理注册监听器与 signal 同步变更之间的窄窗口。
    if (sourceSignal.aborted) onAbort();
    return () => sourceSignal.removeEventListener?.("abort", onAbort);
  });
};

/**
 * RxJS + Axios 的跨端 HTTP 客户端。
 *
 * 所有网络动作都放在 defer 中，因此构造客户端、创建请求 Observable 以及配置工厂本身都不会立即访问网络。
 * Axios 负责浏览器/Node/Nuxt 的适配，RxJS 负责懒执行、共享、重试和错误通道。
 */
export class RxHttpClient {
  private declare readonly axiosInstance: AxiosInstance;
  private declare readonly baseConfig: HttpClientConfig;
  private declare readonly configFactory: HttpConfigFactory | undefined;
  private declare readonly configRetryCount: number;
  private declare cachedConfig: HttpClientConfig | undefined;
  private declare configLoading$: Observable<HttpClientConfig> | undefined;
  private declare readonly inFlight: Map<string, Observable<HttpSuccess<unknown>>>;

  /** 创建使用同步配置的客户端；未传 baseUrl 时默认为空字符串。 */
  constructor(options: HttpClientOptions = {}, configFactory?: HttpConfigFactory) {
    if (typeof options !== "object" || options === null || Array.isArray(options)) {
      throw new TypeError("HttpClientOptions 必须是对象");
    }
    if (options.axiosInstance === undefined) {
      this.axiosInstance = axios;
    } else {
      if (options.axiosInstance === null || typeof options.axiosInstance.request !== "function") {
        throw new TypeError("axiosInstance 必须提供 request 方法");
      }
      this.axiosInstance = options.axiosInstance;
    }

    this.inFlight = new Map();
    this.baseConfig = normalizeConfig(getConfigOptions(options));
    this.configRetryCount = this.baseConfig.retryCount;
    this.configFactory = configFactory;
    if (configFactory === undefined) {
      this.cachedConfig = this.baseConfig;
    }
  }

  /**
   * 创建使用异步配置工厂的客户端。
   *
   * 工厂不会在这里执行，只有第一次请求 Observable 被订阅时才会执行；配置首次成功后缓存在实例中，
   * 配置失败不会缓存失败结果，后续请求可以再次初始化。工厂本身必须返回 Observable，不能返回 Promise。
   */
  static create(factory: HttpConfigFactory, options: HttpClientOptions = {}): RxHttpClient {
    if (typeof factory !== "function") {
      throw new TypeError("HttpConfigFactory 必须是函数");
    }
    return new RxHttpClient(options, factory);
  }

  /** 发起通用请求；输入配置只做浅复制，不会修改调用方的 params、data 或 headers。 */
  request<T = unknown, D = unknown>(config: HttpRequestConfig<D>): Observable<HttpSuccess<T>> {
    assertObject(config, "HttpRequestConfig 必须是对象");
    if (typeof config.url !== "string") {
      throw new TypeError("请求 url 必须是字符串");
    }
    if (typeof config.method !== "string") {
      throw new TypeError("请求 method 必须是字符串");
    }

    const input: HttpRequestConfig<D> = {
      ...config,
      method: normalizeMethod(config.method),
    };
    // 这些值与客户端异步配置无关，提前校验可以让调用方尽早得到 TypeError，而不是订阅后才收到运行时错误。
    if (input.retryCount !== undefined) {
      normalizePositiveInteger(input.retryCount, 1, "retryCount");
    }
    if (input.retryDelay !== undefined) {
      normalizeNonNegativeNumber(input.retryDelay, 0, "retryDelay");
    }
    if (input.timeout !== undefined) {
      normalizeOptionalTimeout(input.timeout, "timeout");
    }
    if (input.retryable !== undefined && typeof input.retryable !== "boolean") {
      throw new TypeError("retryable 必须是布尔值");
    }
    if (input.retryNonIdempotent !== undefined && typeof input.retryNonIdempotent !== "boolean") {
      throw new TypeError("retryNonIdempotent 必须是布尔值");
    }
    if (input.dedupe !== undefined && typeof input.dedupe !== "boolean") {
      throw new TypeError("dedupe 必须是布尔值");
    }
    if (
      input.cancelOnNoSubscribers !== undefined &&
      typeof input.cancelOnNoSubscribers !== "boolean"
    ) {
      throw new TypeError("cancelOnNoSubscribers 必须是布尔值");
    }
    if (input.dedupeKey !== undefined && typeof input.dedupeKey !== "string") {
      throw new TypeError("dedupeKey 必须是字符串");
    }
    validateSignal(input.signal);

    const request$ = defer(() => this.getConfig$()).pipe(
      switchMap((clientConfig) => {
        const request = this.resolveRequest(clientConfig, input);
        const key = this.getDedupeKey(request);
        if (key === undefined) {
          return this.executeRequest<T, D>(request);
        }
        return this.getOrCreateInFlight<T, D>(key, request);
      }),
    );
    const callerAbort$ = createCallerAbort$(input.signal);
    const result$ = callerAbort$ === undefined ? request$ : race(callerAbort$, request$);

    return result$.pipe(
      catchError((error: unknown) =>
        throwError(() => (error instanceof HttpRequestError ? error : toHttpRequestError(error))),
      ),
    );
  }

  /** 发起 GET 请求。 */
  get<T = unknown>(url: string, options?: HttpRequestOptions): Observable<HttpSuccess<T>> {
    return this.request<T>({ ...normalizeRequestOptions(options), method: "GET", url });
  }

  /** 发起 POST 请求。 */
  post<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: HttpRequestOptions,
  ): Observable<HttpSuccess<T>> {
    const config: HttpRequestConfig<D> = {
      ...normalizeRequestOptions(options),
      method: "POST",
      url,
    };
    if (data !== undefined) config.data = data;
    return this.request<T, D>(config);
  }

  /** 发起 PUT 请求。 */
  put<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: HttpRequestOptions,
  ): Observable<HttpSuccess<T>> {
    const config: HttpRequestConfig<D> = {
      ...normalizeRequestOptions(options),
      method: "PUT",
      url,
    };
    if (data !== undefined) config.data = data;
    return this.request<T, D>(config);
  }

  /** 发起 PATCH 请求。 */
  patch<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: HttpRequestOptions,
  ): Observable<HttpSuccess<T>> {
    const config: HttpRequestConfig<D> = {
      ...normalizeRequestOptions(options),
      method: "PATCH",
      url,
    };
    if (data !== undefined) config.data = data;
    return this.request<T, D>(config);
  }

  /** 发起 DELETE 请求。 */
  delete<T = unknown>(url: string, options?: HttpRequestOptions): Observable<HttpSuccess<T>> {
    return this.request<T>({ ...normalizeRequestOptions(options), method: "DELETE", url });
  }

  /** 获取并缓存异步配置；并发首请求共享同一个初始化 Observable。 */
  private getConfig$(): Observable<HttpClientConfig> {
    if (this.cachedConfig !== undefined) return of(this.cachedConfig);
    if (this.configLoading$ !== undefined) return this.configLoading$;
    if (this.configFactory === undefined) {
      this.cachedConfig = this.baseConfig;
      return of(this.cachedConfig);
    }

    const config$ = defer(() => {
      const result = this.configFactory?.();
      if (result === undefined || typeof result.subscribe !== "function") {
        throw new TypeError("HttpConfigFactory 必须返回 Observable");
      }
      return result;
    }).pipe(
      // 只读取第一个配置值，避免配置流持续发值导致客户端配置在请求过程中变化。
      first(),
      map((partial) => {
        assertObject(partial, "异步 HTTP 配置必须是对象");
        return normalizeConfig({ ...this.baseConfig, ...partial });
      }),
      // 配置初始化使用同步选项中的 retryCount；异步配置中的 retryCount 只影响后续请求。
      retry({ count: this.configRetryCount - 1, delay: this.baseConfig.retryDelay }),
      tap((config) => {
        this.cachedConfig = config;
      }),
      catchError((error: unknown) => throwError(() => toHttpRequestError(error, "config"))),
      finalize(() => {
        // 失败不缓存；成功时保留 cachedConfig，后续请求直接复用，不再执行工厂。
        if (this.cachedConfig === undefined) this.configLoading$ = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.configLoading$ = config$;
    return config$;
  }

  /** 将请求级覆盖项与已解析客户端配置合并，并在网络执行前完成边界校验。 */
  private resolveRequest<D>(
    clientConfig: HttpClientConfig,
    input: HttpRequestConfig<D>,
  ): ResolvedRequest<D> {
    const retryCount = normalizePositiveInteger(
      input.retryCount,
      clientConfig.retryCount,
      "retryCount",
    );
    const retryDelay = normalizeNonNegativeNumber(
      input.retryDelay,
      clientConfig.retryDelay,
      "retryDelay",
    );
    const timeout = normalizeOptionalTimeout(
      input.timeout === undefined ? clientConfig.timeout : input.timeout,
      "timeout",
    );
    const retryable = input.retryable === undefined ? clientConfig.retryable : input.retryable;
    if (typeof retryable !== "boolean") {
      throw new TypeError("retryable 必须是布尔值");
    }
    const retryNonIdempotent =
      input.retryNonIdempotent === undefined
        ? clientConfig.retryNonIdempotent
        : input.retryNonIdempotent;
    if (typeof retryNonIdempotent !== "boolean") {
      throw new TypeError("retryNonIdempotent 必须是布尔值");
    }
    const dedupe = input.dedupe === undefined ? clientConfig.dedupe : input.dedupe;
    if (typeof dedupe !== "boolean") {
      throw new TypeError("dedupe 必须是布尔值");
    }
    const cancelOnNoSubscribers =
      input.cancelOnNoSubscribers === undefined
        ? clientConfig.cancelOnNoSubscribers
        : input.cancelOnNoSubscribers;
    if (typeof cancelOnNoSubscribers !== "boolean") {
      throw new TypeError("cancelOnNoSubscribers 必须是布尔值");
    }
    if (input.dedupeKey !== undefined && typeof input.dedupeKey !== "string") {
      throw new TypeError("dedupeKey 必须是字符串");
    }

    const result: ResolvedRequest<D> = {
      method: input.method,
      url: resolveUrl(clientConfig.baseUrl, input.url),
      retryCount,
      retryDelay,
      retryable,
      retryNonIdempotent,
      dedupe,
      cancelOnNoSubscribers,
    };
    if (input.data !== undefined) result.data = input.data;
    if (input.params !== undefined) result.params = input.params;
    if (input.headers !== undefined) result.headers = input.headers;
    if (timeout !== undefined) result.timeout = timeout;
    if (input.dedupeKey !== undefined) result.dedupeKey = input.dedupeKey;
    if (input.signal !== undefined) result.signal = input.signal;
    return result;
  }

  /**
   * 根据请求语义生成 in-flight key。
   *
   * 自动 key 使用现有 jsonStringify 的递归 key 排序，再用 Md5 压缩长度；两个依赖均为可选 peer，
   * 仅从本子路径使用 HTTP 功能时需要安装。无法稳定 JSON 序列化时宁可关闭自动去重，也不冒险合并请求。
   */
  private getDedupeKey<D>(request: ResolvedRequest<D>): string | undefined {
    if (!request.dedupe || request.signal !== undefined) return undefined;

    const identity = {
      method: request.method,
      url: request.url,
      params: request.params,
      headers: request.headers,
      timeout: request.timeout,
      retryCount: request.retryCount,
      retryDelay: request.retryDelay,
      retryable: request.retryable,
      retryNonIdempotent: request.retryNonIdempotent,
      cancelOnNoSubscribers: request.cancelOnNoSubscribers,
      ...(request.dedupeKey === undefined
        ? { data: request.data }
        : { dedupeKey: request.dedupeKey }),
    };

    try {
      let serializableIdentity: typeof identity = identity;
      if (!isStableJsonValue(serializableIdentity)) {
        // 显式 key 的语义是由调用方接管不稳定字段；保留稳定请求维度，避免不同 URL 或 method 串请求。
        if (request.dedupeKey === undefined) return undefined;
        serializableIdentity = {
          method: request.method,
          url: request.url,
          timeout: request.timeout,
          retryCount: request.retryCount,
          retryDelay: request.retryDelay,
          retryable: request.retryable,
          retryNonIdempotent: request.retryNonIdempotent,
          cancelOnNoSubscribers: request.cancelOnNoSubscribers,
          dedupeKey: request.dedupeKey,
        } as typeof identity;
      }
      const serialized = jsonStringify(serializableIdentity, {
        sortKeys: true,
        onCycle: "throw",
      });
      if (serialized === undefined) return undefined;
      const prefix = request.dedupeKey === undefined ? "auto" : "explicit";
      return `${prefix}:${new Md5().update(serialized).toHex()}`;
    } catch {
      // 序列化失败代表 body/headers/params 的结构不稳定；让本次请求独立执行。
      return undefined;
    }
  }

  /** 创建或复用同 key 的 in-flight Observable；请求完成/失败/取消后都会清理 Map。 */
  private getOrCreateInFlight<T, D>(
    key: string,
    request: ResolvedRequest<D>,
  ): Observable<HttpSuccess<T>> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing as Observable<HttpSuccess<T>>;

    // 只有第一次订阅进入这里才登记 Map；Observable 创建本身不会占用去重槽位。
    let shared$: Observable<HttpSuccess<unknown>>;
    const source$ = this.executeRequest<T, D>(request).pipe(
      finalize(() => {
        if (this.inFlight.get(key) === shared$) this.inFlight.delete(key);
      }),
    );
    // 默认不取消底层请求时不能使用 refCount，否则最后一个订阅者离开会让 source finalize 并清掉 Map，
    // 但 Axios Promise 仍在执行，随后相同请求会重新发起。开启自动取消时才让 refCount 控制底层生命周期。
    shared$ = source$.pipe(shareReplay({ bufferSize: 1, refCount: request.cancelOnNoSubscribers }));
    this.inFlight.set(key, shared$);
    return shared$ as Observable<HttpSuccess<T>>;
  }

  /** 通过 defer/from 接入 Axios Promise，并按规则进行请求级重试和统一错误转换。 */
  private executeRequest<T, D>(request: ResolvedRequest<D>): Observable<HttpSuccess<T>> {
    return defer(() => {
      const abortLifecycle = createAbortLifecycle(request.signal, request.cancelOnNoSubscribers);
      let settled = false;
      const axiosConfig: AxiosRequestConfig<D> = {
        method: request.method.toLowerCase(),
        url: request.url,
      };
      if (request.params !== undefined) axiosConfig.params = request.params;
      if (request.headers !== undefined) axiosConfig.headers = request.headers;
      if (request.data !== undefined) axiosConfig.data = request.data;
      if (request.timeout !== undefined) axiosConfig.timeout = request.timeout;
      if (abortLifecycle.signal !== undefined) axiosConfig.signal = abortLifecycle.signal;

      const retryAllowed =
        request.retryable && (SAFE_RETRY_METHODS.has(request.method) || request.retryNonIdempotent);

      return defer(() =>
        from(this.axiosInstance.request<T, AxiosResponse<T>, D>(axiosConfig)),
      ).pipe(
        retry({
          count: retryAllowed ? request.retryCount - 1 : 0,
          delay: (error: unknown) => {
            if (!retryAllowed || !isRetryableError(error)) {
              return throwError(() => error);
            }
            return request.retryDelay > 0 ? timer(request.retryDelay) : of(null);
          },
        }),
        map((response) => {
          settled = true;
          return this.toSuccess<T>(response);
        }),
        catchError((error: unknown) => {
          settled = true;
          return throwError(() => toHttpRequestError(error));
        }),
        finalize(() => {
          // 只有 source 被订阅者主动解除且请求尚未结束时才 abort，正常完成/失败不触发额外取消。
          if (!settled) abortLifecycle.abort();
          abortLifecycle.cleanup();
        }),
      );
    });
  }

  /** 将 Axios 响应映射为只携带 HTTP 状态码的统一成功结果。 */
  private toSuccess<T>(response: AxiosResponse<T>): HttpSuccess<T> {
    return {
      code: response.status,
      success: true,
      data: response.data,
      error: null,
    };
  }
}
