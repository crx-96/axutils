import { AxiosError, isAxiosError, isCancel } from "axios";

/** 共享底层错误识别；是否重试和最终错误分类由各客户端独立决定。 */

export const CONFIG_ERROR_CODES = new Set([
  "ERR_BAD_OPTION",
  "ERR_BAD_OPTION_VALUE",
  "ERR_DEPRECATED",
  "ERR_INVALID_URL",
  "ERR_NOT_SUPPORT",
]);

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return String(error);
  } catch {
    return "HTTP 请求失败";
  }
};

export const getResponseStatus = (error: unknown): number | undefined => {
  if (isAxiosError(error) && error.response !== undefined) return error.response.status;
  return undefined;
};

export const isTimeoutError = (error: unknown): boolean => {
  if (!isAxiosError(error)) return false;
  return (
    error.code === AxiosError.ETIMEDOUT ||
    error.code === AxiosError.ECONNABORTED ||
    /timeout/iu.test(error.message)
  );
};

export const isCancellationError = (error: unknown): boolean =>
  isCancel(error) || (isAxiosError(error) && error.code === AxiosError.ERR_CANCELED);
