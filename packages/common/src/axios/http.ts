import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  isAxiosError,
  isCancel,
} from "axios";

import { Md5 } from "../crypto/md5.js";
import { jsonStringify } from "../object/json.js";

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
export interface PromiseHttpClientOptions extends Partial<PromiseHttpClientConfig> {
  axiosInstance?: AxiosInstance;
}

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

/**
 * 请求最终失败时拒绝的错误实例。
 *
 * 除了继承 Error，还直接暴露统一失败结果中的字段，便于 Promise 调用方统一处理，
 * 并通过 cause 保留底层 Axios 或配置工厂的原始错误。
 */
export class PromiseHttpRequestError extends Error implements PromiseHttpFailure {
  declare readonly code: number;
  declare readonly success: false;
  declare readonly data: null;
  declare readonly error: PromiseHttpErrorInfo;
  declare readonly cause: unknown;

  constructor(code: number, error: PromiseHttpErrorInfo) {
    super(error.message);
    this.name = "PromiseHttpRequestError";
    this.code = code;
    this.success = false;
    this.data = null;
    this.error = error;
    this.cause = error.cause;
    // ES2020 下 Error 子类在部分运行时需要显式修复原型链，保证 instanceof 稳定。
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const DEFAULT_CONFIG: PromiseHttpClientConfig = {
  baseUrl: "",
  retryCount: 3,
  retryDelay: 0,
  dedupe: true,
  retryable: true,
  retryNonIdempotent: false,
};

// 限制误配置造成的请求风暴；100 次已覆盖正常业务重试场景，同时保持失败可控。
const MAX_RETRY_COUNT = 100;
// 浏览器和 Node.js 定时器使用 32 位有符号整数表达毫秒延迟，超过该值可能溢出。
const MAX_TIMER_DELAY = 2_147_483_647;

const HTTP_METHODS = new Set<PromiseHttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);
const SAFE_RETRY_METHODS = new Set<PromiseHttpMethod>(["GET", "HEAD", "OPTIONS"]);
const CONFIG_ERROR_CODES = new Set([
  "ERR_BAD_OPTION",
  "ERR_BAD_OPTION_VALUE",
  "ERR_DEPRECATED",
  "ERR_INVALID_URL",
  "ERR_NOT_SUPPORT",
]);

interface ResolvedRequest<D> {
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

/** 仅提取同步配置，避免把 Axios 实例意外合并进异步配置对象。 */
const getConfigOptions = (options: PromiseHttpClientOptions): Partial<PromiseHttpClientConfig> => {
  const config: Partial<PromiseHttpClientConfig> = {};
  if (options.baseUrl !== undefined) config.baseUrl = options.baseUrl;
  if (options.retryCount !== undefined) config.retryCount = options.retryCount;
  if (options.retryDelay !== undefined) config.retryDelay = options.retryDelay;
  if (options.timeout !== undefined) config.timeout = options.timeout;
  if (options.dedupe !== undefined) config.dedupe = options.dedupe;
  if (options.retryable !== undefined) config.retryable = options.retryable;
  if (options.retryNonIdempotent !== undefined) {
    config.retryNonIdempotent = options.retryNonIdempotent;
  }
  return config;
};

/** 配置和请求入口共用的对象校验，明确拒绝 null 与数组，避免静默回退默认值。 */
function assertObject(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(message);
  }
}

const normalizeRequestOptions = (
  options: PromiseHttpRequestOptions | undefined,
): PromiseHttpRequestOptions => {
  if (options === undefined) return {};
  assertObject(options, "PromiseHttpRequestOptions 必须是对象");
  return options;
};

const validateSignal = (signal: unknown): void => {
  if (signal === undefined) return;
  const candidate = signal as {
    aborted?: unknown;
    addEventListener?: unknown;
    removeEventListener?: unknown;
  };
  if (
    typeof signal !== "object" ||
    signal === null ||
    typeof candidate.aborted !== "boolean" ||
    typeof candidate.addEventListener !== "function" ||
    typeof candidate.removeEventListener !== "function"
  ) {
    throw new TypeError("signal 必须是 AbortSignal");
  }
};

const normalizePositiveInteger = (value: unknown, fallback: number, name: string): number => {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 1) {
    throw new TypeError(`${name} 必须是大于等于 1 的整数`);
  }
  if (result > MAX_RETRY_COUNT) {
    throw new RangeError(`${name} 不能超过 ${MAX_RETRY_COUNT}`);
  }
  return result;
};

const normalizeNonNegativeNumber = (value: unknown, fallback: number, name: string): number => {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "number" || !Number.isFinite(result) || result < 0) {
    throw new TypeError(`${name} 必须是大于等于 0 的有限数字`);
  }
  if (result > MAX_TIMER_DELAY) {
    throw new RangeError(`${name} 不能超过 ${MAX_TIMER_DELAY} 毫秒`);
  }
  return result;
};

const normalizeOptionalTimeout = (value: unknown, name: string): number | undefined => {
  if (value === undefined) return undefined;
  return normalizeNonNegativeNumber(value, 0, name);
};

const normalizeConfig = (config: Partial<PromiseHttpClientConfig>): PromiseHttpClientConfig => {
  const baseUrl = config.baseUrl === undefined ? DEFAULT_CONFIG.baseUrl : config.baseUrl;
  if (typeof baseUrl !== "string") throw new TypeError("baseUrl 必须是字符串");

  const dedupe = config.dedupe === undefined ? DEFAULT_CONFIG.dedupe : config.dedupe;
  if (typeof dedupe !== "boolean") throw new TypeError("dedupe 必须是布尔值");
  const retryable = config.retryable === undefined ? DEFAULT_CONFIG.retryable : config.retryable;
  if (typeof retryable !== "boolean") throw new TypeError("retryable 必须是布尔值");
  const retryNonIdempotent =
    config.retryNonIdempotent === undefined
      ? DEFAULT_CONFIG.retryNonIdempotent
      : config.retryNonIdempotent;
  if (typeof retryNonIdempotent !== "boolean") {
    throw new TypeError("retryNonIdempotent 必须是布尔值");
  }

  const result: PromiseHttpClientConfig = {
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
  };
  const timeout = normalizeOptionalTimeout(config.timeout, "timeout");
  if (timeout !== undefined) result.timeout = timeout;
  return result;
};

const normalizeMethod = (method: string): PromiseHttpMethod => {
  const normalized = method.toUpperCase() as PromiseHttpMethod;
  if (!HTTP_METHODS.has(normalized)) throw new TypeError(`不支持的 HTTP method：${method}`);
  return normalized;
};

/** Axios baseURL 拼接规则的轻量等价实现，同时用于发送请求和生成稳定去重 key。 */
const resolveUrl = (baseUrl: string, url: string): string => {
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//iu.test(url) || baseUrl === "") return url;
  if (url === "") return baseUrl;
  return `${baseUrl.replace(/\/+$/u, "")}/${url.replace(/^\/+/u, "")}`;
};

/** 只允许 JSON 的稳定子集自动去重，避免 Map、流和类实例丢失请求语义。 */
const isStableJsonValue = (value: unknown, ancestors = new WeakSet<object>()): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.every((item) => isStableJsonValue(item, ancestors));
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
  if (isAxiosError(error) && error.response !== undefined) return error.response.status;
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

const isCancellationError = (error: unknown): boolean =>
  isCancel(error) || (isAxiosError(error) && error.code === AxiosError.ERR_CANCELED);

/**
 * 仅允许明确的 Axios 网络错误、超时、429 和 5xx 重试。
 *
 * 自定义 adapter 抛出的普通 Error 或无 response 的未知 AxiosError 无法证明是网络故障，
 * 因此宁可只执行一次，也不能把配置/编程错误误当网络错误造成请求风暴。
 */
const isRetryableError = (error: unknown): boolean => {
  if (isCancellationError(error)) return false;
  const status = getResponseStatus(error);
  if (status !== undefined) return status === 429 || (status >= 500 && status < 600);
  if (isTimeoutError(error)) return true;
  return isAxiosError(error) && error.code === AxiosError.ERR_NETWORK;
};

const classifyError = (error: unknown): PromiseHttpErrorKind => {
  if (isCancellationError(error)) return "cancel";
  if (getResponseStatus(error) !== undefined) return "http";
  if (isTimeoutError(error)) return "timeout";
  if (isAxiosError(error)) {
    if (error.code !== undefined && CONFIG_ERROR_CODES.has(error.code)) return "config";
    if (error.code === AxiosError.ERR_NETWORK) return "network";
    return "unknown";
  }
  return "unknown";
};

const toPromiseHttpRequestError = (
  error: unknown,
  forcedKind?: PromiseHttpErrorKind,
): PromiseHttpRequestError => {
  if (error instanceof PromiseHttpRequestError && forcedKind === undefined) return error;
  const kind = forcedKind ?? classifyError(error);
  const status = forcedKind === "config" ? 0 : (getResponseStatus(error) ?? 0);
  return new PromiseHttpRequestError(status, {
    kind,
    message: getErrorMessage(error),
    cause: error,
  });
};

const createCancellationError = (): AxiosError =>
  new AxiosError("canceled", AxiosError.ERR_CANCELED);

const throwIfAborted = (signal: AxiosRequestConfig["signal"]): void => {
  if (signal?.aborted) throw createCancellationError();
};

/** 等待重试延迟并监听 signal，保证 delay 阶段不会吞掉调用方取消。 */
const waitForDelay = (delay: number, signal?: AxiosRequestConfig["signal"]): Promise<void> => {
  if (delay === 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
    const onAbort = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      cleanup();
      reject(createCancellationError());
    };
    const cleanup = () => signal?.removeEventListener?.("abort", onAbort);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });
    // 处理注册监听器与 signal 同步变化之间的窄窗口。
    if (signal?.aborted) onAbort();
  });
};

/**
 * 将普通 Promise 与调用方 signal 竞速。
 * 配置工厂本身无法被强制中止，但当前调用可以在 signal abort 后立即结束，避免等待不可取消的工厂。
 */
const raceWithSignal = <T>(
  promise: Promise<T>,
  signal: AxiosRequestConfig["signal"],
): Promise<T> => {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.reject(createCancellationError());

  let cleanup = () => undefined;
  const cancellation = new Promise<never>((_, reject) => {
    const onAbort = () => {
      cleanup();
      reject(createCancellationError());
    };
    cleanup = () => signal.removeEventListener?.("abort", onAbort);
    signal.addEventListener?.("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  return Promise.race([promise, cancellation]).finally(cleanup);
};

/**
 * 跨浏览器、Node.js 与 Nuxt 的 Axios Promise HTTP 客户端。
 *
 * 使用本类需要安装 `axios`、`safe-stable-stringify` 和 `spark-md5`：
 * `pnpm add axios safe-stable-stringify spark-md5`。本文件不导入 RxJS。
 */
export class PromiseHttpClient {
  private declare readonly axiosInstance: AxiosInstance;
  private declare readonly baseConfig: PromiseHttpClientConfig;
  private declare readonly configFactory: PromiseHttpConfigFactory | undefined;
  private declare readonly configRetryCount: number;
  private declare cachedConfig: PromiseHttpClientConfig | undefined;
  private declare configLoading: Promise<PromiseHttpClientConfig> | undefined;
  private declare readonly inFlight: Map<string, Promise<PromiseHttpSuccess<unknown>>>;

  /** 创建使用同步配置的客户端；构造函数不会执行网络请求或配置工厂。 */
  constructor(options: PromiseHttpClientOptions = {}, configFactory?: PromiseHttpConfigFactory) {
    assertObject(options, "PromiseHttpClientOptions 必须是对象");
    const clientOptions = options as PromiseHttpClientOptions;
    if (clientOptions.axiosInstance === undefined) {
      this.axiosInstance = axios;
    } else {
      if (
        clientOptions.axiosInstance === null ||
        typeof clientOptions.axiosInstance.request !== "function"
      ) {
        throw new TypeError("axiosInstance 必须提供 request 方法");
      }
      this.axiosInstance = clientOptions.axiosInstance;
    }

    this.inFlight = new Map();
    this.baseConfig = normalizeConfig(getConfigOptions(clientOptions));
    this.configRetryCount = this.baseConfig.retryCount;
    this.configFactory = configFactory;
    if (configFactory === undefined) this.cachedConfig = this.baseConfig;
  }

  /** 创建使用异步配置工厂的客户端；工厂在第一次请求时执行，并缓存成功配置。 */
  static create(
    factory: PromiseHttpConfigFactory,
    options: PromiseHttpClientOptions = {},
  ): PromiseHttpClient {
    if (typeof factory !== "function") throw new TypeError("PromiseHttpConfigFactory 必须是函数");
    return new PromiseHttpClient(options, factory);
  }

  /** 发起通用请求；输入配置只做浅复制，不会修改调用方的 params、data 或 headers。 */
  request<T = unknown, D = unknown>(
    config: PromiseHttpRequestConfig<D>,
  ): Promise<PromiseHttpSuccess<T>> {
    assertObject(config, "PromiseHttpRequestConfig 必须是对象");
    if (typeof config.url !== "string") throw new TypeError("请求 url 必须是字符串");
    if (typeof config.method !== "string") throw new TypeError("请求 method 必须是字符串");

    const input: PromiseHttpRequestConfig<D> = {
      ...config,
      method: normalizeMethod(config.method),
    };
    this.validateRequestInput(input);

    if (input.signal?.aborted) {
      return Promise.reject(toPromiseHttpRequestError(createCancellationError()));
    }

    // 配置初始化属于客户端共享状态；signal 只竞速当前调用方的等待，不应进入共享 Promise。
    const operation = this.getConfigPromise().then((clientConfig) => {
      const request = this.resolveRequest(clientConfig, input);
      const key = this.getDedupeKey(request);
      if (key === undefined) return this.executeRequest<T, D>(request);
      return this.getOrCreateInFlight<T, D>(key, request);
    });

    return raceWithSignal(operation, input.signal).catch((error: unknown) => {
      throw error instanceof PromiseHttpRequestError ? error : toPromiseHttpRequestError(error);
    });
  }

  /** 发起 GET 请求。 */
  get<T = unknown>(
    url: string,
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpSuccess<T>> {
    return this.request<T>({ ...normalizeRequestOptions(options), method: "GET", url });
  }

  /** 发起 POST 请求。 */
  post<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpSuccess<T>> {
    const config: PromiseHttpRequestConfig<D> = {
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
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpSuccess<T>> {
    return this.request<T, D>({
      ...normalizeRequestOptions(options),
      method: "PUT",
      url,
      ...(data === undefined ? {} : { data }),
    });
  }

  /** 发起 PATCH 请求。 */
  patch<T = unknown, D = unknown>(
    url: string,
    data?: D,
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpSuccess<T>> {
    return this.request<T, D>({
      ...normalizeRequestOptions(options),
      method: "PATCH",
      url,
      ...(data === undefined ? {} : { data }),
    });
  }

  /** 发起 DELETE 请求。 */
  delete<T = unknown>(
    url: string,
    options?: PromiseHttpRequestOptions,
  ): Promise<PromiseHttpSuccess<T>> {
    return this.request<T>({ ...normalizeRequestOptions(options), method: "DELETE", url });
  }

  private validateRequestInput(input: PromiseHttpRequestConfig): void {
    if (input.retryCount !== undefined) normalizePositiveInteger(input.retryCount, 1, "retryCount");
    if (input.retryDelay !== undefined)
      normalizeNonNegativeNumber(input.retryDelay, 0, "retryDelay");
    if (input.timeout !== undefined) normalizeOptionalTimeout(input.timeout, "timeout");
    if (input.retryable !== undefined && typeof input.retryable !== "boolean") {
      throw new TypeError("retryable 必须是布尔值");
    }
    if (input.retryNonIdempotent !== undefined && typeof input.retryNonIdempotent !== "boolean") {
      throw new TypeError("retryNonIdempotent 必须是布尔值");
    }
    if (input.dedupe !== undefined && typeof input.dedupe !== "boolean") {
      throw new TypeError("dedupe 必须是布尔值");
    }
    if (input.dedupeKey !== undefined && typeof input.dedupeKey !== "string") {
      throw new TypeError("dedupeKey 必须是字符串");
    }
    validateSignal(input.signal);
  }

  /** 获取并缓存异步配置；共享初始化不绑定任何请求 signal，失败不缓存。 */
  private getConfigPromise(): Promise<PromiseHttpClientConfig> {
    if (this.cachedConfig !== undefined) return Promise.resolve(this.cachedConfig);
    if (this.configLoading !== undefined) return this.configLoading;
    if (this.configFactory === undefined) {
      this.cachedConfig = this.baseConfig;
      return Promise.resolve(this.cachedConfig);
    }

    const loading = this.initializeConfig();
    this.configLoading = loading;
    void loading.then(
      (config) => {
        if (this.configLoading === loading) {
          // 配置初始化属于客户端级状态；只要共享初始化成功，就可以缓存供所有请求复用。
          this.cachedConfig = config;
          this.configLoading = undefined;
        }
      },
      () => {
        if (this.configLoading === loading) this.configLoading = undefined;
      },
    );
    return loading;
  }

  private async initializeConfig(): Promise<PromiseHttpClientConfig> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.configRetryCount; attempt += 1) {
      try {
        const partial = await Promise.resolve(this.configFactory?.());
        assertObject(partial, "异步 HTTP 配置必须是对象");
        return normalizeConfig({ ...this.baseConfig, ...partial });
      } catch (error) {
        if (isCancellationError(error)) throw error;
        lastError = error;
        if (attempt < this.configRetryCount) {
          await waitForDelay(this.baseConfig.retryDelay);
        }
      }
    }
    throw toPromiseHttpRequestError(lastError, "config");
  }

  /** 将请求级覆盖项与已解析客户端配置合并，并在网络执行前完成边界校验。 */
  private resolveRequest<D>(
    clientConfig: PromiseHttpClientConfig,
    input: PromiseHttpRequestConfig<D>,
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
    if (typeof retryable !== "boolean") throw new TypeError("retryable 必须是布尔值");
    const retryNonIdempotent =
      input.retryNonIdempotent === undefined
        ? clientConfig.retryNonIdempotent
        : input.retryNonIdempotent;
    if (typeof retryNonIdempotent !== "boolean") {
      throw new TypeError("retryNonIdempotent 必须是布尔值");
    }
    const dedupe = input.dedupe === undefined ? clientConfig.dedupe : input.dedupe;
    if (typeof dedupe !== "boolean") throw new TypeError("dedupe 必须是布尔值");
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
   * 带 signal 的调用必须独立执行；不稳定请求体默认关闭自动去重，显式 dedupeKey 则由调用方接管身份。
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
      ...(request.dedupeKey === undefined
        ? { data: request.data }
        : { dedupeKey: request.dedupeKey }),
    };

    try {
      let serializableIdentity: typeof identity = identity;
      if (!isStableJsonValue(serializableIdentity)) {
        if (request.dedupeKey === undefined) return undefined;
        serializableIdentity = {
          method: request.method,
          url: request.url,
          timeout: request.timeout,
          retryCount: request.retryCount,
          retryDelay: request.retryDelay,
          retryable: request.retryable,
          retryNonIdempotent: request.retryNonIdempotent,
          dedupeKey: request.dedupeKey,
        } as typeof identity;
      }
      const serialized = jsonStringify(serializableIdentity, { sortKeys: true, onCycle: "throw" });
      if (serialized === undefined) return undefined;
      const prefix = request.dedupeKey === undefined ? "auto" : "explicit";
      return `${prefix}:${new Md5().update(serialized).toHex()}`;
    } catch {
      // 序列化失败时让请求独立执行，避免错误合并两个语义未知的请求。
      return undefined;
    }
  }

  /** 创建或复用同 key 的 in-flight Promise；成功、失败、取消后都会清理 Map。 */
  private getOrCreateInFlight<T, D>(
    key: string,
    request: ResolvedRequest<D>,
  ): Promise<PromiseHttpSuccess<T>> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing as Promise<PromiseHttpSuccess<T>>;

    const source = this.executeRequest<T, D>(request);
    let tracked!: Promise<PromiseHttpSuccess<unknown>>;
    tracked = source.then(
      (result) => {
        if (this.inFlight.get(key) === tracked) this.inFlight.delete(key);
        return result;
      },
      (error: unknown) => {
        if (this.inFlight.get(key) === tracked) this.inFlight.delete(key);
        throw error;
      },
    ) as Promise<PromiseHttpSuccess<unknown>>;
    this.inFlight.set(key, tracked);
    return tracked as Promise<PromiseHttpSuccess<T>>;
  }

  /** 通过显式循环接入 Axios Promise，并按规则进行请求级重试和统一错误转换。 */
  private async executeRequest<T, D>(request: ResolvedRequest<D>): Promise<PromiseHttpSuccess<T>> {
    const axiosConfig: AxiosRequestConfig<D> = {
      method: request.method.toLowerCase(),
      url: request.url,
    };
    if (request.params !== undefined) axiosConfig.params = request.params;
    if (request.headers !== undefined) axiosConfig.headers = request.headers;
    if (request.data !== undefined) axiosConfig.data = request.data;
    if (request.timeout !== undefined) axiosConfig.timeout = request.timeout;
    if (request.signal !== undefined) axiosConfig.signal = request.signal;

    const retryAllowed =
      request.retryable && (SAFE_RETRY_METHODS.has(request.method) || request.retryNonIdempotent);
    for (let attempt = 1; attempt <= request.retryCount; attempt += 1) {
      try {
        throwIfAborted(request.signal);
        const response = await this.axiosInstance.request<T, AxiosResponse<T>, D>(axiosConfig);
        return this.toSuccess(response);
      } catch (error) {
        const canRetry = attempt < request.retryCount && retryAllowed && isRetryableError(error);
        if (!canRetry) throw toPromiseHttpRequestError(error);
        await waitForDelay(request.retryDelay, request.signal);
      }
    }
    throw new Error("HTTP 请求执行流程异常");
  }

  /** 将 Axios 响应映射为只携带 HTTP 状态码的统一成功结果。 */
  private toSuccess<T>(response: AxiosResponse<T>): PromiseHttpSuccess<T> {
    return { code: response.status, success: true, data: response.data, error: null };
  }
}
