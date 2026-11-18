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

/** 按 URL、method 的顺序校验必填字段，再浅复制其余自有可枚举选项。 */
export function snapshotRequestInput<T extends { method: string; url: string }>(
  config: T,
  normalizeMethod: (method: string) => T["method"],
  readSignal?: () => unknown,
): T {
  // 普通属性访问支持原型 getter。必填项无效时，在枚举选项或读取请求体前结束。
  const url = config.url;
  if (typeof url !== "string") throw new TypeError("请求 url 必须是字符串");
  const method = config.method;
  if (typeof method !== "string") throw new TypeError("请求 method 必须是字符串");
  const input = { method: normalizeMethod(method), url };

  // 与对象展开一样逐键检查可枚举性并创建数据属性，保留 Symbol 和 __proto__ 键的语义。
  for (const key of Reflect.ownKeys(config)) {
    if (
      key === "url" ||
      key === "method" ||
      !Object.prototype.propertyIsEnumerable.call(config, key)
    )
      continue;
    Object.defineProperty(input, key, {
      configurable: true,
      enumerable: true,
      // Rx 错误恢复也需要 signal，可传入同一次读取供快照与恢复共用。
      value: key === "signal" && readSignal !== undefined ? readSignal() : Reflect.get(config, key),
      writable: true,
    });
  }
  // 两个客户端的其余配置字段均可选，其自有可枚举值已按原引用复制。
  return input as T;
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

/** 通过描述符判断协议成员是否可能可调用。访问器和无法确认实现的代理按可能可调用处理。 */
function mayHaveMethod(value: object, key: PropertyKey): boolean {
  // 普通 JSON 通常没有协议成员，仅在命中时沿原型查找实际定义。
  if (!(key in value)) return false;
  let owner: object | null = value;
  const visited = new Set<object>();
  while (owner !== null && !visited.has(owner)) {
    const member = Object.getOwnPropertyDescriptor(owner, key);
    if (member) return typeof member.value === "function" || member.get !== undefined;
    visited.add(owner);
    owner = Object.getPrototypeOf(owner);
  }
  // 代理可声明虚拟成员或返回循环原型，均无法确认请求体可重放。
  return true;
}

/** 在可重试的失败后检查原始请求体，包含 multipart 对象或数组中可能已消费的文件流。 */
export function canReplayRequestBody(data: unknown): boolean {
  if (data === null || typeof data !== "object") return true;
  try {
    // Set 的遍历会访问新加入的对象，每个引用只检查一次，也避免深层表单耗尽调用栈。
    const parts = new Set<object>([data]);
    for (const part of parts) {
      if (
        mayHaveMethod(part, Symbol.asyncIterator) ||
        mayHaveMethod(part, "getReader") ||
        (mayHaveMethod(part, "pipe") && mayHaveMethod(part, "on")) ||
        (mayHaveMethod(part, "next") && mayHaveMethod(part, Symbol.iterator))
      )
        return false;

      // 仅展开普通记录（含跨 Realm）与数组，跳过文件、字节缓冲区等宿主值的内部字段。
      const proto: object | null = Object.getPrototypeOf(part);
      if (
        !Array.isArray(part) &&
        proto !== null &&
        proto !== Object.prototype &&
        Object.getPrototypeOf(proto) !== null
      )
        continue;
      for (const name of Object.keys(part)) {
        // 使用描述符而非取值。getter 可能返回已消费的流，无法确认时沿用首个传输错误。
        const field = Object.getOwnPropertyDescriptor(part, name);
        if (!field || field.get !== undefined) return false;
        const child: unknown = field.value;
        if (child !== null && typeof child === "object") parts.add(child);
      }
    }
    return true;
  } catch {
    // 无法检查代理对象时保留首次传输错误，不冒险重发。
    return false;
  }
}

/** 这些方法默认允许按网络错误规则重试。 */
export const SAFE_RETRY_METHODS = new Set<string>(["GET", "HEAD", "OPTIONS"]);
