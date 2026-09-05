/** 保持原有 HTTP 公共入口；内部模块仅按职责拆分，不增加包导出路径。 */

export { PromiseHttpClient } from "./http/client.js";

export { PromiseHttpRequestError } from "./http/errors.js";

export type {
  PromiseHttpClientConfig,
  PromiseHttpClientOptions,
  PromiseHttpConfigFactory,
  PromiseHttpErrorInfo,
  PromiseHttpErrorKind,
  PromiseHttpFailure,
  PromiseHttpMethod,
  PromiseHttpRequestConfig,
  PromiseHttpRequestOptions,
  PromiseHttpResult,
  PromiseHttpSuccess,
} from "./http/types.js";
