/**
 * JSON 序列化与反序列化工具。
 *
 * 序列化底层使用 [safe-stable-stringify](https://www.npmjs.com/package/safe-stable-stringify)，
 * 这是已知最快的稳定/确定性 JSON 序列化实现，原生支持循环引用处理和 key 排序。
 *
 * 设计思路：
 * - **FastPath**：未传入配置项时直接调用原生 `JSON.stringify` / `JSON.parse`，零额外开销。
 * - **配置化路径**：通过 `safe-stable-stringify` 的 `configure` 工厂按需创建序列化器，
 *   支持 key 排序、过滤 nullish 字段、缩进格式化和循环引用处理。
 *
 * 性能说明：
 * - `safe-stable-stringify` 在简单对象上约为原生 `JSON.stringify` 的 0.9 倍（几乎无损耗），
 *   在排序场景下是同类库中最快的（约 30K ops/s）。
 * - `safe-stable-stringify` 作为 **peerDependencies + optional** 声明，
 *   仅当使用 `@axutils/common/object/json` 子路径时才需要安装；不使用 json 功能的用户无需安装。
 *
 * 能力边界：
 * - 不支持 `Symbol`、`Map`/`Set` 序列化（与原生一致）。
 * - `BigInt` 支持：`safe-stable-stringify` 默认将其序列化为数字（与原生不同，原生会抛错）。
 * - `Date`、`RegExp` 等内置对象的序列化行为与原生一致（依赖 `toJSON`）。
 */

import { configure } from "safe-stable-stringify";

/**
 * key 排序配置。
 *
 * - `true` 或 `"asc"`：按 Unicode 升序排列。
 * - `"desc"`：按 Unicode 降序排列。
 * - 自定义比较函数：与 `Array.prototype.sort` 的比较函数语义一致。
 * - 不传或 `false`：保持对象原有 key 顺序（`Object.keys` 的插入顺序）。
 */
type SortKeysOption = boolean | "asc" | "desc" | ((a: string, b: string) => number);

/**
 * 循环引用处理策略。
 *
 * - `"throw"`：抛出 {@link JsonCircularReferenceError}（默认行为）。
 * - `"skip"`：将循环引用字段值替换为 `null`（不删除字段，数组中同理）。
 *   注意：底层 `safe-stable-stringify` 的 skip 语义是 null 替代而非字段删除。
 *   如需完全删除字段，可配合 `filterNullish: true` 使用（null 会被过滤）。
 */
type OnCycleOption = "throw" | "skip";

/**
 * JSON 序列化配置。
 */
export interface JsonStringifyOptions {
  /**
   * 对象 key 排序规则，见 {@link SortKeysOption}。
   *
   * 仅对对象自身的可枚举字符串 key 生效，数组元素顺序不受影响。
   */
  sortKeys?: SortKeysOption;
  /**
   * 是否过滤值为 `null` 或 `undefined` 的字段。
   *
   * 仅过滤对象字段，数组元素不受影响（`null` 在 JSON 数组中是合法值）。
   * 注意：原生 `JSON.stringify` 本身会忽略 `undefined` 值的字段，
   * 开启此项后还会额外过滤 `null` 值字段。
   */
  filterNullish?: boolean;
  /**
   * 缩进配置，透传给序列化逻辑。
   *
   * - `number`：每层缩进对应该数量的空格。
   * - `string`：每层缩进使用该字符串。
   */
  space?: number | string;
  /**
   * 循环引用处理策略，见 {@link OnCycleOption}，默认 `"throw"`。
   */
  onCycle?: OnCycleOption;
}

/**
 * JSON 反序列化配置。
 */
export interface JsonParseOptions {
  /**
   * 对解析结果中的对象 key 排序，见 {@link SortKeysOption}。
   *
   * 仅对对象自身的可枚举字符串 key 生效，数组元素顺序不受影响。
   */
  sortKeys?: SortKeysOption;
  /**
   * 是否过滤值为 `null` 的字段。
   *
   * 注意：JSON 文本中不存在 `undefined`，因此这里只过滤 `null`。
   */
  filterNullish?: boolean;
}

/**
 * 循环引用错误。
 *
 * 注意：由于底层 `safe-stable-stringify` 不提供循环引用的路径信息，
 * `path` 属性始终为空字符串，仅用于接口兼容。
 * 错误消息中不包含具体路径，但错误类型和名称可用于 `instanceof` 判断。
 */
class JsonCircularReferenceError extends Error {
  /** 循环引用所在的对象访问路径。当前实现中始终为空字符串，仅用于接口兼容，调用方不应依赖此字段获取实际路径信息。 */
  declare path: string;

  constructor(path: string) {
    super(`检测到循环引用${path ? `，路径：${path}` : ""}`);
    this.name = "JsonCircularReferenceError";
    this.path = path;
  }
}

/**
 * 将 `SortKeysOption` 归一化为 `safe-stable-stringify` 的 `deterministic` 配置值。
 *
 * - `undefined` / `false` -> `false`（不排序，保持原顺序）
 * - `true` / `"asc"` -> `true`（升序）
 * - `"desc"` -> 自定义降序比较函数
 * - 自定义函数 -> 直接透传
 *
 * 这是文件内部辅助函数，不对外导出。
 */
const resolveDeterministic = (
  sortKeys: SortKeysOption | undefined,
): boolean | ((a: string, b: string) => number) => {
  if (sortKeys === undefined || sortKeys === false) {
    return false;
  }
  if (sortKeys === true || sortKeys === "asc") {
    return true;
  }
  if (sortKeys === "desc") {
    return (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
  }
  return sortKeys;
};

/**
 * 创建 filterNullish 用的 replacer 函数。
 *
 * replacer 返回 `undefined` 时，`JSON.stringify` / `safe-stable-stringify` 会跳过该字段。
 * 这里对 `null` 和 `undefined` 值都返回 `undefined`，实现字段过滤。
 *
 * 注意：根值（key 为 `""`）不过滤，避免整个结果变为 `undefined`。
 * 这是文件内部辅助函数，不对外导出。
 */
const createFilterReplacer = () => {
  let isRoot = true;
  return (_key: string, value: unknown): unknown => {
    if (isRoot) {
      isRoot = false;
      return value;
    }
    if (value === null || value === undefined) {
      return undefined;
    }
    return value;
  };
};

/**
 * 检测对象图中是否存在循环引用。
 *
 * 用 `WeakSet` 跟踪已访问的对象，深度优先遍历整个对象图。
 * 仅做检测，不修改原值，也不调用 `toJSON`。
 * 这是文件内部辅助函数，不对外导出。
 *
 * @param value 待检测的值
 * @returns 存在循环引用返回 `true`，否则返回 `false`
 */
const detectCircular = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const seen = new WeakSet<object>();

  const hasCycle = (current: unknown): boolean => {
    if (typeof current !== "object" || current === null) {
      return false;
    }

    if (seen.has(current)) {
      return true;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        if (hasCycle(item)) {
          return true;
        }
      }
    } else {
      for (const key of Object.keys(current)) {
        if (hasCycle((current as Record<string, unknown>)[key])) {
          return true;
        }
      }
    }

    return false;
  };

  return hasCycle(value);
};

/**
 * 判断当前配置是否所有项均为默认值（即无需额外处理）。
 *
 * FastPath 判定：返回 true 时直接走原生 `JSON.stringify`。
 * `onCycle` 为非默认值（`"skip"`）时需走配置化路径；
 * `onCycle` 为 `undefined` 或 `"throw"` 时，原生 `JSON.stringify` 遇到循环引用也会抛错，行为可接受。
 * 这是文件内部辅助函数，不对外导出。
 */
const isDefaultStringifyOptions = (options: JsonStringifyOptions | undefined): boolean => {
  if (options === undefined) {
    return true;
  }
  if (options.sortKeys !== undefined && options.sortKeys !== false) {
    return false;
  }
  if (options.filterNullish) {
    return false;
  }
  // onCycle 显式传值时（含 "throw"）需走配置化路径，抛 JsonCircularReferenceError
  // onCycle 为 undefined 时走 FastPath，原生遇到循环引用抛 TypeError，行为可接受
  if (options.onCycle !== undefined) {
    return false;
  }
  return true;
};

/**
 * JSON 序列化方法。
 *
 * 在原生 `JSON.stringify` 基础上增加配置项：key 排序、过滤 nullish 字段、
 * 缩进格式化、循环引用处理。底层使用 `safe-stable-stringify` 实现配置化路径。
 *
 * **FastPath**：未传入配置或所有配置项均为默认值时，直接调用原生 `JSON.stringify`，
 * 性能与原生完全一致。
 *
 * **配置化路径**：通过 `safe-stable-stringify` 的 `configure` 工厂创建序列化器，
 * 按需配置排序、循环引用处理和 replacer（用于 filterNullish）。
 *
 * 依赖说明：使用本方法需要安装 peer 依赖 `safe-stable-stringify`（`npm i safe-stable-stringify`）。
 * 不使用 `@axutils/common/object/json` 子路径的用户无需安装。
 *
 * @param value 待序列化的值
 * @param options 序列化配置，见 {@link JsonStringifyOptions}
 * @returns JSON 字符串；当根值为 `undefined`、函数或 `Symbol` 时，与原生一致返回 `undefined`
 * @throws {JsonCircularReferenceError} 检测到循环引用且 `onCycle` 为 `"throw"`（默认）
 */
export const jsonStringify = (
  value: unknown,
  options?: JsonStringifyOptions,
): string | undefined => {
  // FastPath：无配置或全默认 -> 原生 stringify，零开销
  if (isDefaultStringifyOptions(options)) {
    const space = options?.space;
    return space !== undefined ? JSON.stringify(value, null, space) : JSON.stringify(value);
  }

  const onCycle = options?.onCycle ?? "throw";

  // 循环引用预检测：不依赖底层库的错误消息文本，引擎无关
  // 检测到循环引用时，onCycle === "throw" 直接抛 JsonCircularReferenceError
  // onCycle === "skip" 交给 safe-stable-stringify 的 circularValue: null 处理
  if (onCycle === "throw" && detectCircular(value)) {
    throw new JsonCircularReferenceError("");
  }

  // onCycle === "skip" 时 circularValue 设为 null（循环引用值替换为 null），
  // 否则设为 Error（理论上不会触达，循环引用已被预检测拦截，仅作兜底）
  // 注意：不用展开运算符 ...，避免 es2015 target 下 esbuild 注入 @oxc-project/runtime 辅助
  const config = {
    deterministic: resolveDeterministic(options?.sortKeys),
    bigint: true,
    circularValue: onCycle === "skip" ? null : Error,
  };
  const stringify = configure(config);

  // filterNullish 用 replacer 实现
  const replacer = options?.filterNullish ? createFilterReplacer() : null;

  return stringify(value, replacer, options?.space);
};

/**
 * 递归后处理解析结果。
 *
 * 对 `JSON.parse` 的结果做 key 排序和 null 字段过滤。
 * 排序会创建新的对象/数组，不修改原始结构。
 * 这是文件内部辅助函数，不对外导出。
 */
const postProcess = <T>(
  value: T,
  comparator: ((a: string, b: string) => number) | null,
  filterNullish: boolean,
): T => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => postProcess(item, comparator, filterNullish)) as T;
  }

  const obj = value as Record<string, unknown>;
  let keys = Object.keys(obj);
  if (comparator !== null) {
    keys = [...keys].sort(comparator);
  }
  if (filterNullish) {
    keys = keys.filter((key) => obj[key] !== null);
  }

  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = postProcess(obj[key], comparator, filterNullish);
  }
  return result as T;
};

/**
 * 将 `SortKeysOption` 归一化为可直接用于 `Array.prototype.sort` 的比较函数。
 *
 * 返回 `null` 表示不需要排序（保持原顺序）。
 * 这是文件内部辅助函数，不对外导出。
 */
const resolveComparator = (
  sortKeys: SortKeysOption | undefined,
): ((a: string, b: string) => number) | null => {
  if (sortKeys === undefined || sortKeys === false) {
    return null;
  }
  if (sortKeys === true || sortKeys === "asc") {
    return (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  }
  if (sortKeys === "desc") {
    return (a, b) => (a < b ? 1 : a > b ? -1 : 0);
  }
  return sortKeys;
};

/**
 * JSON 反序列化方法。
 *
 * 先用原生 `JSON.parse` 解析，再按配置项对结果做后处理（key 排序、过滤 null 字段）。
 * 反序列化不依赖 `safe-stable-stringify`，纯原生实现。
 *
 * **FastPath**：未传入配置时直接调用原生 `JSON.parse`，性能与原生一致。
 *
 * 注意：
 * - JSON 文本中不存在 `undefined`，因此 `filterNullish` 只过滤 `null`。
 * - 排序会创建新对象，不保证引用相等。
 *
 * @param text JSON 文本
 * @param options 反序列化配置，见 {@link JsonParseOptions}
 * @returns 解析后的值
 * @throws {SyntaxError} 文本不是合法 JSON
 */
export const jsonParse = <T = unknown>(text: string, options?: JsonParseOptions): T => {
  // FastPath：无配置 -> 原生 parse
  if (options === undefined) {
    return JSON.parse(text) as T;
  }

  const comparator = resolveComparator(options.sortKeys);
  const filterNullish = options.filterNullish ?? false;

  if (comparator === null && !filterNullish) {
    return JSON.parse(text) as T;
  }

  const parsed = JSON.parse(text) as T;
  return postProcess(parsed, comparator, filterNullish);
};

/**
 * 安全版 JSON 序列化方法。
 *
 * 行为与 {@link jsonStringify} 完全一致，区别在于任何异常（包括
 * {@link JsonCircularReferenceError}、`TypeError`、`SyntaxError` 等）
 * 都不会抛出，而是直接返回 `null`。
 *
 * 适用场景：不关心失败原因、只需保证流程不中断的容错场景，
 * 例如日志输出、缓存写入、不可信数据的兜底处理。
 * 如需区分错误类型或获取错误信息，请使用会抛异常的 {@link jsonStringify}。
 *
 * @param value 待序列化的值
 * @param options 序列化配置，见 {@link JsonStringifyOptions}
 * @returns 成功时返回 JSON 字符串；根值不可序列化时返回 `undefined`；任何异常时返回 `null`
 */
export const jsonStringifySafe = (
  value: unknown,
  options?: JsonStringifyOptions,
): string | null | undefined => {
  try {
    return jsonStringify(value, options);
  } catch {
    return null;
  }
};

/**
 * 安全版 JSON 反序列化方法。
 *
 * 行为与 {@link jsonParse} 完全一致，区别在于任何异常（包括
 * `SyntaxError` 等解析错误）都不会抛出，而是直接返回 `null`。
 *
 * 适用场景：解析不可信的外部输入、配置文件兜底、网络响应容错等
 * 不关心失败原因、只需保证流程不中断的场景。
 * 如需区分错误类型或获取错误信息，请使用会抛异常的 {@link jsonParse}。
 *
 * 注意：由于合法的 JSON 可以解析为 `null`（如文本 `"null"`），
 * 调用方无法仅凭返回值 `null` 区分"解析失败"与"原文就是 null"。
 * 若需区分，请使用 {@link jsonParse} 捕获异常。
 *
 * @param text JSON 文本
 * @param options 反序列化配置，见 {@link JsonParseOptions}
 * @returns 成功时返回解析后的值，任何异常时返回 `null`
 */
export const jsonParseSafe = <T = unknown>(text: string, options?: JsonParseOptions): T | null => {
  try {
    return jsonParse<T>(text, options);
  } catch {
    return null;
  }
};

export { JsonCircularReferenceError };
