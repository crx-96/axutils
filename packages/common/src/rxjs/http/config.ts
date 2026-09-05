import { HTTP_METHODS, assertObject, resolveUrl } from "../../internal/http/primitives.js";
import type {
  HttpClientConfig,
  HttpClientOptions,
  HttpMethod,
  HttpRequestConfig,
  HttpRequestOptions,
  ResolvedRequest,
} from "./types.js";

const DEFAULT_CONFIG: HttpClientConfig = {
  baseUrl: "",
  cancelOnNoSubscribers: false,
  dedupe: true,
  retryable: true,
  retryCount: 3,
  retryDelay: 0,
  retryNonIdempotent: false,
};

/** 只提取同步配置，避免把 Axios 实例意外合并进异步配置对象。 */
export const getConfigOptions = (options: HttpClientOptions): Partial<HttpClientConfig> => {
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

export const normalizeRequestOptions = (
  options: HttpRequestOptions | undefined,
): HttpRequestOptions => {
  if (options === undefined) return {};
  assertObject(options, "HttpRequestOptions 必须是对象");
  return options;
};

export const validateSignal = (signal: unknown): void => {
  if (signal === undefined) return;
  if (
    typeof signal !== "object" ||
    signal === null ||
    typeof (signal as { aborted?: unknown }).aborted !== "boolean"
  ) {
    throw new TypeError("signal 必须是 AbortSignal");
  }
};

export const normalizePositiveInteger = (
  value: unknown,
  fallback: number,
  name: string,
): number => {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "number" || !Number.isInteger(result) || result < 1) {
    throw new TypeError(`${name} 必须是大于等于 1 的整数`);
  }
  return result;
};

export const normalizeNonNegativeNumber = (
  value: unknown,
  fallback: number,
  name: string,
): number => {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "number" || !Number.isFinite(result) || result < 0) {
    throw new TypeError(`${name} 必须是大于等于 0 的有限数字`);
  }
  return result;
};

export const normalizeOptionalTimeout = (value: unknown, name: string): number | undefined => {
  if (value === undefined) return undefined;
  return normalizeNonNegativeNumber(value, 0, name);
};

export const normalizeConfig = (config: Partial<HttpClientConfig>): HttpClientConfig => {
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
    cancelOnNoSubscribers,
    dedupe,
    retryable,
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
    retryNonIdempotent,
  };
  const timeout = normalizeOptionalTimeout(config.timeout, "timeout");
  if (timeout !== undefined) result.timeout = timeout;
  return result;
};

export const normalizeMethod = (method: string): HttpMethod => {
  const normalized = method.toUpperCase() as HttpMethod;
  if (!HTTP_METHODS.has(normalized)) {
    throw new TypeError(`不支持的 HTTP method：${method}`);
  }
  return normalized;
};

/** 请求级覆盖项在网络执行前按当前客户端的规则合并与校验。 */
export function resolveRequest<D>(
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
    cancelOnNoSubscribers,
    dedupe,
    method: input.method,
    retryable,
    retryCount,
    retryDelay,
    retryNonIdempotent,
    url: resolveUrl(clientConfig.baseUrl, input.url),
  };
  if (input.data !== undefined) result.data = input.data;
  if (input.params !== undefined) result.params = input.params;
  if (input.headers !== undefined) result.headers = input.headers;
  if (timeout !== undefined) result.timeout = timeout;
  if (input.dedupeKey !== undefined) result.dedupeKey = input.dedupeKey;
  if (input.signal !== undefined) result.signal = input.signal;
  return result;
}

/** 保持入口处同步校验的顺序，避免把输入错误推迟到配置或网络阶段。 */
export function validateRequestInput(input: HttpRequestConfig): void {
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
}
