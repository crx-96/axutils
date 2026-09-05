/** 两种 HTTP 客户端共用的无状态判断；客户端默认值与校验上限由各自 config 保留。 */

/** 配置和请求入口共用的对象校验，明确拒绝 null 与数组，避免静默回退默认值。 */
export function assertObject(
  value: unknown,
  message: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(message);
  }
}

/** Axios 的 baseURL 拼接规则的轻量等价实现，用于发送请求和生成稳定去重 key。 */
export const resolveUrl = (baseUrl: string, url: string): string => {
  // 与 Axios isAbsoluteURL 一致：协议 URL 和以 // 开头的协议相对 URL 不拼接 baseUrl。
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//iu.test(url) || baseUrl === "") {
    return url;
  }
  if (url === "") return baseUrl;
  return `${baseUrl.replace(/\/+$/u, "")}/${url.replace(/^\/+/u, "")}`;
};

export const HTTP_METHODS = new Set<string>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

// 这些方法通常不会因为重复执行而再次创建业务副作用，默认允许按网络错误规则重试。
export const SAFE_RETRY_METHODS = new Set<string>(["GET", "HEAD", "OPTIONS"]);
