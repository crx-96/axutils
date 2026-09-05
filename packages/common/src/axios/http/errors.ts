import { AxiosError, isAxiosError } from "axios";
import {
  CONFIG_ERROR_CODES,
  getErrorMessage,
  getResponseStatus,
  isCancellationError,
  isTimeoutError,
} from "../../internal/http/error-utils.js";
import type { PromiseHttpErrorInfo, PromiseHttpErrorKind, PromiseHttpFailure } from "./types.js";

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

/**
 * 仅允许明确的 Axios 网络错误、超时、429 和 5xx 重试。
 *
 * 自定义 adapter 抛出的普通 Error 或无 response 的未知 AxiosError 无法证明是网络故障，
 * 因此宁可只执行一次，也不能把配置/编程错误误当网络错误造成请求风暴。
 */
export const isRetryableError = (error: unknown): boolean => {
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

export const toPromiseHttpRequestError = (
  error: unknown,
  forcedKind?: PromiseHttpErrorKind,
): PromiseHttpRequestError => {
  if (error instanceof PromiseHttpRequestError && forcedKind === undefined) return error;
  const kind = forcedKind ?? classifyError(error);
  const status = forcedKind === "config" ? 0 : (getResponseStatus(error) ?? 0);
  return new PromiseHttpRequestError(status, {
    cause: error,
    kind,
    message: getErrorMessage(error),
  });
};
