import { serializeRequestIdentity } from "../../internal/http/request-identity.js";
import type { ResolvedRequest } from "./types.js";

/** Promise 调用仅在共享传输地址和重试行为都一致时共用进行中请求。 */
export function getDedupeKey<D>(
  request: ResolvedRequest<D>,
  transportIdentity: string | undefined,
): string | undefined {
  return serializeRequestIdentity(request, transportIdentity, {
    method: request.method,
    retryable: request.retryable,
    retryCount: request.retryCount,
    retryDelay: request.retryDelay,
    retryNonIdempotent: request.retryNonIdempotent,
    url: request.url,
  });
}
