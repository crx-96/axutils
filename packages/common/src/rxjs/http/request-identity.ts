import { serializeRequestIdentity } from "../../internal/http/request-identity.js";
import type { ResolvedRequest } from "./types.js";

/** 保留当前客户端完整的请求身份字段；带 signal 的请求独立执行。 */
export function getDedupeKey<D>(request: ResolvedRequest<D>): string | undefined {
  if (!request.dedupe || request.signal !== undefined) return undefined;

  // biome-ignore assist/source/useSortedKeys: 稳定性检查会遍历字段，保留用户数据 getter 的访问顺序。
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

  return serializeRequestIdentity(identity, request.dedupeKey, () => ({
    cancelOnNoSubscribers: request.cancelOnNoSubscribers,
    dedupeKey: request.dedupeKey,
    method: request.method,
    retryable: request.retryable,
    retryCount: request.retryCount,
    retryDelay: request.retryDelay,
    retryNonIdempotent: request.retryNonIdempotent,
    timeout: request.timeout,
    url: request.url,
  }));
}
