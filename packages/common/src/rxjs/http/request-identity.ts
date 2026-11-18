import { serializeRequestIdentity } from "../../internal/http/request-identity.js";
import type { ResolvedRequest } from "./types.js";

/** Rx 订阅的共享身份包含最后一位订阅者离开时是否取消传输的策略。 */
export function getDedupeKey<D>(
  request: ResolvedRequest<D>,
  transportIdentity: string | undefined,
): string | undefined {
  return serializeRequestIdentity(request, transportIdentity, {
    cancelOnNoSubscribers: request.cancelOnNoSubscribers,
    method: request.method,
    retryable: request.retryable,
    retryCount: request.retryCount,
    retryDelay: request.retryDelay,
    retryNonIdempotent: request.retryNonIdempotent,
    url: request.url,
  });
}
