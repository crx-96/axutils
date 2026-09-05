import { HTTP_METHODS, assertObject, resolveUrl } from "../../internal/http/primitives.js";
import type {
  PromiseHttpClientConfig,
  PromiseHttpClientOptions,
  PromiseHttpMethod,
  PromiseHttpRequestConfig,
  PromiseHttpRequestOptions,
  ResolvedRequest,
} from "./types.js";

const DEFAULT_CONFIG: PromiseHttpClientConfig = {
  baseUrl: "",
  dedupe: true,
  retryable: true,
  retryCount: 3,
  retryDelay: 0,
  retryNonIdempotent: false,
};

// 限制误配置造成的请求风暴；100 次已覆盖正常业务重试场景，同时保持失败可控。
const MAX_RETRY_COUNT = 100;

// 浏览器和 Node.js 定时器使用 32 位有符号整数表达毫秒延迟，超过该值可能溢出。
const MAX_TIMER_DELAY = 2_147_483_647;

/** 仅提取同步配置，避免把 Axios 实例意外合并进异步配置对象。 */
export const getConfigOptions = (
  options: PromiseHttpClientOptions,
): Partial<PromiseHttpClientConfig> => {
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

export const normalizeRequestOptions = (
  options: PromiseHttpRequestOptions | undefined,
): PromiseHttpRequestOptions => {
  if (options === undefined) return {};
  assertObject(options, "PromiseHttpRequestOptions 必须是对象");
  return options;
};

export const validateSignal = (signal: unknown): void => {
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

export const normalizePositiveInteger = (
  value: unknown,
  fallback: number,
  name: string,
): number => {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 1) {
    throw new TypeError(`${name} 必须是大于等于 1 的整数`);
  }
  if (result > MAX_RETRY_COUNT) {
    throw new RangeError(`${name} 不能超过 ${MAX_RETRY_COUNT}`);
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
  if (result > MAX_TIMER_DELAY) {
    throw new RangeError(`${name} 不能超过 ${MAX_TIMER_DELAY} 毫秒`);
  }
  return result;
};

export const normalizeOptionalTimeout = (value: unknown, name: string): number | undefined => {
  if (value === undefined) return undefined;
  return normalizeNonNegativeNumber(value, 0, name);
};

export const normalizeConfig = (
  config: Partial<PromiseHttpClientConfig>,
): PromiseHttpClientConfig => {
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

export const normalizeMethod = (method: string): PromiseHttpMethod => {
  const normalized = method.toUpperCase() as PromiseHttpMethod;
  if (!HTTP_METHODS.has(normalized)) throw new TypeError(`不支持的 HTTP method：${method}`);
  return normalized;
};

/** 请求级覆盖项在网络执行前按当前客户端的规则合并与校验。 */
export function resolveRequest<D>(
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
export function validateRequestInput(input: PromiseHttpRequestConfig): void {
  if (input.retryCount !== undefined) normalizePositiveInteger(input.retryCount, 1, "retryCount");
  if (input.retryDelay !== undefined) normalizeNonNegativeNumber(input.retryDelay, 0, "retryDelay");
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
