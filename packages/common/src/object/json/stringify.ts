import { configure } from "safe-stable-stringify";

import type { JsonStringifyOptions, OnCycleOption, SortKeysOption } from "./types.js";

/**
 * 循环引用错误。
 *
 * 库内部的祖先检测只追踪容器引用，不维护路径，因此内部抛出的错误 path 为空字符串。
 * 显式构造时保留调用方提供的路径；错误类型和名称可用于 instanceof 判断。
 */
export class JsonCircularReferenceError extends Error {
  /** 构造时提供的访问路径；库内部抛错时为空字符串，不能据此恢复实际路径。 */
  declare path: string;

  /** 创建兼容的循环引用错误；path 由内部传入空字符串，不推测对象路径。 */
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
  // 默认保留键顺序；升序可以直接使用第三方排序能力。
  if (sortKeys === undefined || sortKeys === false) {
    return false;
  }
  if (sortKeys === true || sortKeys === "asc") {
    return true;
  }
  // 降序显式反转比较，自定义比较函数保持调用方语义。
  if (sortKeys === "desc") {
    return (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
  }
  return sortKeys;
};

/**
 * 在序列化器已经执行 toJSON 之后按实际访问路径检查循环，同时过滤对象的 nullish 字段。
 * 不预读用户属性，getter 与 toJSON 的调用次数和异常均由唯一一次实际序列化决定。
 */
const createStringifyReplacer = (
  onCycle: OnCycleOption,
  filterNullish: boolean,
): ((this: unknown, key: string, value: unknown) => unknown) => {
  /** 当前序列化路径中的容器，最近访问的容器位于末尾。 */
  const ancestors: object[] = [];
  /** 与祖先栈同步的引用集合；共享兄弟引用在离开原分支后可以再次进入。 */
  const activeAncestors = new WeakSet<object>();
  /** 根值不能被 nullish 过滤；空字符串业务键仍然按普通字段处理。 */
  let isRoot = true;

  /** this 是当前字段所属容器，value 已完成 toJSON 转换。 */
  return function (this: unknown, _key: string, value: unknown): unknown {
    const root = isRoot;
    isRoot = false;

    if (onCycle === "throw") {
      // 序列化器从深层返回同级字段时，弹出已经离开的容器，只保留当前父链。
      while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
        const completed = ancestors.pop();
        if (completed !== undefined) activeAncestors.delete(completed);
      }

      // 只把实际作为容器序列化的对象加入路径；转换前的自引用不一定会进入 JSON。
      if (typeof value === "object" && value !== null) {
        if (activeAncestors.has(value)) throw new JsonCircularReferenceError("");
        ancestors.push(value);
        activeAncestors.add(value);
      }
    }

    // 数组中的 undefined 仍由序列化器写成 null；根值原样保留原生的返回语义。
    if (!root && filterNullish && (value === null || value === undefined)) return undefined;
    return value;
  };
};

/**
 * 判断当前配置是否所有项均为默认值（即无需额外处理）。
 *
 * FastPath 判定：返回 true 时直接走原生 `JSON.stringify`。
 * 显式 `onCycle`（包括 `"throw"`）使用配置化路径，保留专用循环错误；
 * 只有未配置循环策略、排序和过滤时才使用原生路径。
 * 这是文件内部辅助函数，不对外导出。
 */
const isDefaultStringifyOptions = (options: JsonStringifyOptions | undefined): boolean => {
  // space 只控制展示，不要求进入配置化序列化；其余非默认选项需要额外策略。
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
 * **FastPath**：未启用排序、过滤或显式循环引用策略时，直接调用原生 `JSON.stringify`，
 * 保留原生异常；`space` 可单独设置。
 *
 * **配置化路径**：通过 `safe-stable-stringify` 的 `configure` 工厂创建序列化器，
 * 按需配置排序，以及同次遍历中的循环检测和 nullish 过滤。
 * 显式传入 `onCycle: "throw"` 也会进入此路径，即使未启用其他配置。
 *
 * 依赖说明：使用本方法需要安装 peer 依赖 `safe-stable-stringify`（`npm i safe-stable-stringify`）。
 * 不使用 `@axutils/common/object/json` 子路径的用户无需安装。
 *
 * @param value 待序列化的值
 * @param options 序列化配置，见 {@link JsonStringifyOptions}
 * @returns JSON 字符串；当根值为 `undefined`、函数或 `Symbol` 时，与原生一致返回 `undefined`
 * @throws {TypeError} 原生路径遇到循环引用或 BigInt 等不可序列化值
 * @throws {JsonCircularReferenceError} 配置化路径检测到循环引用，且 `onCycle` 未传或为 `"throw"`
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

  // 让底层实际遍历对象并调用 toJSON；replacer 在同一次遍历中识别循环，避免提前读取 getter。
  const config = {
    bigint: true,
    circularValue: onCycle === "skip" ? null : Error,
    deterministic: resolveDeterministic(options?.sortKeys),
  };
  const stringify = configure(config);

  // throw 策略需要追踪实际祖先链；skip 仅在过滤开启时添加 replacer，保持循环生成的 null 占位。
  const filterNullish = options?.filterNullish ?? false;
  const replacer =
    onCycle === "throw" || filterNullish ? createStringifyReplacer(onCycle, filterNullish) : null;

  return stringify(value, replacer, options?.space);
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
 * 依赖说明：内部调用 {@link jsonStringify}，同样需要安装 peer 依赖 `safe-stable-stringify`。
 *
 * @param value 待序列化的值
 * @param options 序列化配置，见 {@link JsonStringifyOptions}
 * @returns 成功时返回 JSON 字符串；根值不可序列化时返回 `undefined`；任何异常时返回 `null`
 */
export const jsonStringifySafe = (
  value: unknown,
  options?: JsonStringifyOptions,
): string | null | undefined => {
  // safe 入口明确以 null 表示失败，普通入口的原生或用户异常仍原样传播。
  try {
    return jsonStringify(value, options);
  } catch {
    return null;
  }
};
