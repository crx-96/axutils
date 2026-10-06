/** 保持原有 HTTP 公共入口；内部模块仅按职责拆分，不增加包导出路径。 */

export type { HttpTypedClientFactory } from "./http/client.js";
export { RxHttpClient } from "./http/client.js";

export { HttpRequestError } from "./http/errors.js";

export type {
  HttpClientConfig,
  HttpClientOptions,
  HttpConfigFactory,
  HttpErrorInfo,
  HttpErrorKind,
  HttpErrorTransformer,
  HttpFailure,
  HttpMappedClientOptions,
  HttpMethod,
  HttpRequestConfig,
  HttpRequestContext,
  HttpRequestHeaders,
  HttpRequestOptions,
  HttpResponseResult,
  HttpResponseTransformer,
  HttpResponseTypeMap,
  HttpResult,
  HttpSuccess,
  HttpTransformValue,
} from "./http/types.js";
