import { isAxiosError } from "axios";
import {
  CONFIG_ERROR_CODES,
  getErrorMessage,
  getResponseStatus,
  isCancellationError,
  isTimeoutError,
} from "../../internal/http/error-utils.js";
import type { HttpErrorInfo, HttpErrorKind, HttpFailure } from "./types.js";

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

/** 仅允许网络、超时、429 和 5xx 进入重试，4xx 与取消/配置错误均立即结束。 */
export const isRetryableError = (error: unknown): boolean => {
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

export const toHttpRequestError = (
  error: unknown,
  forcedKind?: HttpErrorKind,
): HttpRequestError => {
  if (error instanceof HttpRequestError && forcedKind === undefined) return error;
  const kind = forcedKind ?? classifyError(error);
  const status = forcedKind === "config" ? 0 : (getResponseStatus(error) ?? 0);
  return new HttpRequestError(status, {
    cause: error,
    kind,
    message: getErrorMessage(error),
  });
};
