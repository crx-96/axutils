import { AxiosHeaders, type AxiosRequestConfig, type RawAxiosRequestHeaders } from "axios";
import { HTTP_METHODS, assertObject } from "./primitives.js";

/** 两种客户端共用的同步请求头处理契约；回调可修改收到的副本。 */
export type HttpHeadersTransform = (headers: RawAxiosRequestHeaders) => RawAxiosRequestHeaders;

/** 保留 false/null/undefined 的屏蔽语义，且不共享调用方的多值数组。 */
function copyHeaders(headers: AxiosHeaders): RawAxiosRequestHeaders {
  return Object.fromEntries(
    Object.keys(headers).map((name) => {
      const value = headers.get(name);
      return [name, Array.isArray(value) ? [...value] : value];
    }),
  );
}

/** 逐项 set 兼容 Axios 请求头允许 undefined、AxiosHeaders 构造声明却不接受它的差异。 */
function setHeaders(target: AxiosHeaders, headers: RawAxiosRequestHeaders | undefined): void {
  for (const [name, value] of Object.entries(headers ?? {})) target.set(name, value, true);
}

/** 在计算去重身份前处理请求头，最后以大小写不敏感的方式应用请求级覆盖。 */
export function transformRequestHeaders(
  headers: AxiosRequestConfig["headers"],
  method: string,
  transform: HttpHeadersTransform,
): RawAxiosRequestHeaders {
  // 与 Axios 一样展开 common 和当前方法的分组，避免把分组名作为实际 header 发送。
  const requested = new AxiosHeaders();
  setHeaders(requested, headers?.common);
  setHeaders(requested, headers?.[method.toLowerCase()]);
  setHeaders(requested, headers);
  requested.delete(["common", ...Array.from(HTTP_METHODS, (name) => name.toLowerCase())]);
  const transformed = transform(copyHeaders(requested));
  assertObject(transformed, "transformHeaders 必须同步返回 headers 对象");
  const prototype: unknown = Object.getPrototypeOf(transformed);
  if (
    !(transformed instanceof AxiosHeaders) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    throw new TypeError("transformHeaders 必须同步返回 headers 对象");
  }
  const result = new AxiosHeaders();
  setHeaders(result, transformed);
  // rewrite=true 确保请求级值也能覆盖回调中的 false；原始请求头从未交给回调修改。
  result.set(requested, true);
  return copyHeaders(result.normalize(true));
}
