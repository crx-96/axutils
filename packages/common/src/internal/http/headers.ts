import {
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type RawAxiosRequestHeaders,
} from "axios";
import { HTTP_METHODS, assertObject } from "./primitives.js";

/** 两种客户端共用的同步请求头处理契约；回调可修改收到的副本。 */
export type HttpHeadersTransform = (headers: RawAxiosRequestHeaders) => RawAxiosRequestHeaders;

/** Axios 分组名只供展开配置，含本库未开放请求入口的 query。 */
const headerGroupNames = [
  "common",
  "query",
  ...Array.from(HTTP_METHODS, (name) => name.toLowerCase()),
];

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

/** 快照自有扁平头，并保留按属性访问可见的 common 和当前方法组，供展开和屏蔽判断复用。 */
function snapshotHeaderGroups(
  headers: AxiosRequestConfig["headers"] | AxiosInstance["defaults"]["headers"],
  method: string,
): RawAxiosRequestHeaders | undefined {
  if (headers == null) return undefined;
  const snapshot: RawAxiosRequestHeaders = Object.create(null);
  const methodGroup = method.toLowerCase();
  // 按原有顺序读取两个分组，缺失与显式 undefined 分别表示继承与屏蔽。
  for (const group of ["common", methodGroup]) {
    if (group in headers) snapshot[group] = headers[group];
  }
  // 扁平头只取自有可枚举字段，其值最后覆盖分组，跳过已读取的组 getter。
  for (const name of Object.keys(headers)) {
    if (name !== "common" && name !== methodGroup) snapshot[name] = headers[name];
  }
  return snapshot;
}

/** 在计算去重身份前处理请求头，最后以大小写不敏感的方式应用请求级覆盖；formatNames 控制输出键的标题格式。 */
export function transformRequestHeaders(
  headers: AxiosRequestConfig["headers"] | AxiosInstance["defaults"]["headers"],
  method: string,
  transform: HttpHeadersTransform,
  formatNames = true,
): RawAxiosRequestHeaders {
  // 与 Axios 一样展开 common 和当前方法的分组，避免把分组名作为实际 header 发送。
  const requested = new AxiosHeaders();
  setHeaders(requested, headers?.common);
  setHeaders(requested, headers?.[method.toLowerCase()]);
  // 分组内的保留名同样不发送。顶层只写入真正的扁平字段，避免 Axios 将组对象强制转为字符串。
  requested.delete(headerGroupNames);
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!headerGroupNames.includes(name.trim().toLowerCase())) requested.set(name, value, true);
  }
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
  return copyHeaders(result.normalize(formatNames));
}

/**
 * 在计算去重身份之前解析最终请求头；默认值、转换结果、请求级字段依次覆盖。
 * 回调只读取请求级头的副本，默认头仅在回调完成后合并，结果不引用调用方的多值数组。
 * formatNames 为 false 时保留原字段名大小写，兼容 Promise 客户端未配置转换的行为。
 */
export function resolveRequestHeaders(
  defaults: AxiosInstance["defaults"]["headers"] | undefined,
  headers: AxiosRequestConfig["headers"],
  method: string,
  transform?: HttpHeadersTransform,
  formatNames = true,
): RawAxiosRequestHeaders {
  // 先处理当前请求，保持回调看不到实例默认值、请求级值始终优先的公开契约。
  // 共用顶层快照，访问器产生的组值既用于展开，也用于判断是否屏蔽默认组。
  const headerSnapshot = snapshotHeaderGroups(headers, method);
  const requested = transformRequestHeaders(
    headerSnapshot,
    method,
    (input) => (transform === undefined ? input : transform(input)),
    formatNames,
  );
  // 显式屏蔽整个分组时先排除对应默认组；对象分组仍逐字段合并，保留回调客户端的既有契约。
  const suppressedGroups = new Set<string>();
  for (const [name, value] of Object.entries(headerSnapshot ?? {})) {
    const group = name.toLowerCase();
    if (
      (group === "common" || group === method.toLowerCase()) &&
      (value === null || value === undefined || value === false)
    ) {
      suppressedGroups.add(group);
    }
  }
  const defaultSource = snapshotHeaderGroups(defaults, method);
  if (defaultSource !== undefined) {
    for (const name of Object.keys(defaultSource)) {
      if (suppressedGroups.has(name.toLowerCase())) defaultSource[name] = new AxiosHeaders();
    }
  }
  // 提前展开其余默认分组，令鉴权等字段参与去重，并在内部重试期间保持一致。
  const defaultHeaders = transformRequestHeaders(
    defaultSource,
    method,
    (input) => input,
    formatNames,
  );
  // 最后仍以 rewrite=true 应用回调与请求级快照，使默认 false 不会锁住显式覆盖。
  return transformRequestHeaders(requested, method, () => defaultHeaders, formatNames);
}

/**
 * 为单次 Axios 尝试创建头配置，屏蔽 Axios 再次合并的当前默认值。
 * 每次尝试重新读取默认键名，使重试期间新加的头也不能改变已经解析的请求身份。
 */
export function createAttemptHeaders(
  defaults: AxiosInstance["defaults"]["headers"] | undefined,
  resolved: AxiosRequestConfig["headers"],
): RawAxiosRequestHeaders {
  // common/方法分组及顶层字段都以 undefined 遮蔽，避免默认 false 锁住请求级覆盖。
  const suppressed: RawAxiosRequestHeaders = Object.fromEntries(
    Object.keys(defaults ?? {}).map((name) => [name, undefined]),
  );
  return { ...suppressed, ...resolved };
}
